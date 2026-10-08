// runSdkAgent + 脚本化假模型：检查"needsApproval → 中断 → 审批 Map → 批准 / 拒绝 → 继续跑"这条链是通的。
// 只有模型是假的，Agents SDK 的 Runner、MCP 调用、工具执行都是真的。

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { runSdkAgent } from './sdkAgent.js'
import { createMockSdkModel } from './mockSdk.js'
import { resolveApproval } from './approvals.js'
import { workspaceRoot } from './workspace.js'

/** 跑一轮，收集所有事件；遇到审批按 decide 的结果回答 */
async function run(text, decide = () => 'deny') {
  const events = []
  const emit = (event, data) => {
    events.push({ event, data })
    if (event === 'approval_required') {
      // 异步地回答，模拟用户过了一会儿才点按钮
      setTimeout(() => resolveApproval(data.approvalId, decide(data), '测试里拒绝'), 10)
    }
  }
  await runSdkAgent({
    messages: [{ role: 'user', content: text }],
    emit,
    signal: new AbortController().signal,
    model: createMockSdkModel(),
  })
  return events
}

/** 每次用一个新文件名：工作区里已经有同名文件的话，create_file 在审批前就会失败（第 31 章） */
const newFile = () => `sdk-test-${crypto.randomUUID().slice(0, 8)}.md`

const textOf = (events) =>
  events
    .filter((e) => e.event === 'delta')
    .map((e) => e.data.text)
    .join('')

describe('runSdkAgent（OpenAI Agents SDK + 假模型）', () => {
  it('只读工具不弹审批，两次调用模型的文字之间补一个空行', async () => {
    const events = await run('读一下 README.md')
    const kinds = events.map((e) => e.event)
    expect(kinds).not.toContain('approval_required')
    expect(kinds.indexOf('tool_start')).toBeLessThan(kinds.indexOf('tool_end'))
    expect(events.find((e) => e.event === 'tool_end').data).toMatchObject({ ok: true })
    expect(textOf(events)).toMatch(/^（Mock 回放）好的。\n\n读完了 README\.md/)
    expect(kinds.at(-1)).toBe('done')
  })

  it('MCP 的任务工具：名字带 mcp_taskflow__ 前缀，结果是真的任务数据', async () => {
    const events = await run('我还有哪些任务没做完')
    const start = events.find((e) => e.event === 'tool_start').data
    expect(start).toMatchObject({ name: 'mcp_taskflow__list_tasks', input: { status: 'todo' } })
    expect(events.find((e) => e.event === 'tool_end').data.summary).toMatch(/^找到 \d+ 条任务$/)
  })

  it('create_file 要审批，卡片里带 diff；拒绝后文件没有被写，模型收到了拒绝的原因', async () => {
    const file = newFile()
    const events = await run(`新建 ${file}`, () => 'deny')
    const approval = events.find((e) => e.event === 'approval_required').data
    expect(approval.name).toBe('create_file')
    expect(approval.preview).toMatchObject({ path: file, isNew: true })

    // tool_start 一定在 approval_required 前面（前端要先有这个工具调用）
    const kinds = events.map((e) => e.event)
    expect(kinds.indexOf('tool_start')).toBeLessThan(kinds.indexOf('approval_required'))

    expect(events.find((e) => e.event === 'tool_end').data).toMatchObject({ ok: false, summary: '已拒绝：测试里拒绝' })
    expect(fs.existsSync(path.join(workspaceRoot(), file))).toBe(false)
    // 假模型读到的是 deniedResult 的那段话 —— 和手写引擎交给模型的一样
    expect(textOf(events)).toContain('没写成：用户拒绝了这次操作')
    expect(kinds.at(-1)).toBe('done')
  })

  it('批准之后 Runner 接着跑：文件真的写进去了，并通知前端刷新文件', async () => {
    const file = newFile()
    const full = path.join(workspaceRoot(), file)
    try {
      const events = await run(`新建 ${file}`, () => 'allow')
      expect(events.find((e) => e.event === 'tool_end').data).toMatchObject({ ok: true })
      expect(events.find((e) => e.event === 'invalidate').data).toMatchObject({ resource: 'files', path: file })
      expect(fs.readFileSync(full, 'utf8')).toContain('OpenAI Agents SDK 引擎')
      expect(textOf(events)).toContain(`写好了 \`${file}\``)
    } finally {
      fs.rmSync(full, { force: true })
    }
  })

  it('工作区外的路径被第 29 章的沙箱拦下，不弹审批', async () => {
    const events = await run('读一下 ../server/.env')
    expect(events.map((e) => e.event)).not.toContain('approval_required')
    const end = events.find((e) => e.event === 'tool_end').data
    expect(end.ok).toBe(false)
    expect(end.summary).toContain('工作区')
  })

  it('没有剧本的问题：说明需要接上真正的模型', async () => {
    const events = await run('帮我重构整个项目')
    expect(textOf(events)).toContain('需要接上真正的模型')
    expect(events.at(-1)).toMatchObject({ event: 'done', data: { usage: { input_tokens: 0, output_tokens: 0 } } })
  })

  it('等审批时用户停止：安静地结束，不发 done 也不发 error', async () => {
    const controller = new AbortController()
    const events = []
    await runSdkAgent({
      messages: [{ role: 'user', content: `新建 ${newFile()}` }],
      emit: (event, data) => {
        events.push({ event, data })
        if (event === 'approval_required') setTimeout(() => controller.abort(), 10)
      },
      signal: controller.signal,
      model: createMockSdkModel(),
    })
    const kinds = events.map((e) => e.event)
    expect(kinds).toContain('approval_required')
    expect(kinds).not.toContain('done')
    expect(kinds).not.toContain('error')
  })
})
