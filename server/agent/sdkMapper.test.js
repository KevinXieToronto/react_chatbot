// 用"按 SDK 类型造出来的事件"（sdkMessages.js）测试映射函数

import { describe, it, expect } from 'vitest'
import { createSdkEventMapper, toWireUsage } from './sdkMapper.js'
import {
  rawResponseStarted,
  rawTextDelta,
  toolCalled,
  approvalRequested,
  toolOutput,
  messageOutput,
} from './sdkMessages.js'

const mapAll = (mapper, events) => events.flatMap((e) => mapper.map(e))
const names = (events) => events.map((e) => e.event)
const text = (events) =>
  events
    .filter((e) => e.event === 'delta')
    .map((e) => e.data.text)
    .join('')

describe('createSdkEventMapper', () => {
  it('文字增量变成 delta，后面那条完整的回答不会再发一遍', () => {
    const mapper = createSdkEventMapper()
    const events = mapAll(mapper, [rawResponseStarted(), rawTextDelta('你好，'), rawTextDelta('世界'), messageOutput('m1', '你好，世界')])
    expect(names(events).every((n) => n === 'delta')).toBe(true)
    expect(text(events)).toBe('你好，世界')
  })

  it('这次调用一个增量都没有时（不支持流式），完整的回答照样变成 delta', () => {
    const mapper = createSdkEventMapper()
    expect(mapAll(mapper, [rawResponseStarted(), messageOutput('m1', '一次性')])).toEqual([
      { event: 'delta', data: { text: '一次性' } },
    ])
  })

  it('两次调用模型的文字之间补一个空行', () => {
    const mapper = createSdkEventMapper()
    const events = mapAll(mapper, [rawResponseStarted(), rawTextDelta('好的。'), rawResponseStarted(), rawTextDelta('读完了')])
    expect(text(events)).toBe('好的。\n\n读完了')
  })

  it('代码工具：tool_start → tool_end，总结和刷新用执行方登记的结果', () => {
    const mapper = createSdkEventMapper()
    const start = mapper.map(toolCalled('call_1', 'create_file', { path: 'notes.md', content: 'hi' }))
    mapper.setOutcome('call_1', {
      ok: true,
      summary: '新建了 notes.md',
      invalidate: { resource: 'files', op: 'create_file', path: 'notes.md' },
    })
    const end = mapper.map(toolOutput('call_1', 'create_file', '已新建 notes.md'))
    expect(start).toEqual([
      { event: 'tool_start', data: { id: 'call_1', name: 'create_file', input: { path: 'notes.md', content: 'hi' } } },
    ])
    expect(end).toEqual([
      { event: 'tool_end', data: { id: 'call_1', ok: true, summary: '新建了 notes.md' } },
      { event: 'invalidate', data: { resource: 'files', op: 'create_file', path: 'notes.md' } },
    ])
  })

  it('审批层登记的结果优先（比如"已拒绝：备注"），失败的不发 invalidate', () => {
    const mapper = createSdkEventMapper()
    mapper.map(approvalRequested('call_2', 'edit_file', { path: 'a.js' }))
    mapper.setOutcome('call_2', { ok: false, summary: '已拒绝：先别改' })
    expect(mapper.map(toolOutput('call_2', 'edit_file', '{"error":"用户拒绝了这次操作"}'))).toEqual([
      { event: 'tool_end', data: { id: 'call_2', ok: false, summary: '已拒绝：先别改' } },
    ])
  })

  it('同一个工具调用不会发两次 tool_start（先要审批、批准后才执行，两个事件都会来）', () => {
    const mapper = createSdkEventMapper()
    const first = mapper.map(approvalRequested('call_3', 'run_command', { command: 'ls' }))
    const again = mapper.map(toolCalled('call_3', 'run_command', { command: 'ls' }))
    expect(first).toHaveLength(1)
    expect(again).toEqual([])
  })

  it('MCP 的任务工具：查询给出条数，写操作通知刷新任务，失败的给出原因', () => {
    const mapper = createSdkEventMapper()
    const list = mapAll(mapper, [
      toolCalled('call_4', 'mcp_taskflow__list_tasks', {}),
      toolOutput('call_4', 'mcp_taskflow__list_tasks', '[{"id":"1"},{"id":"2"}]'),
    ])
    expect(list.at(-1).data.summary).toBe('找到 2 条任务')

    const create = mapAll(mapper, [
      toolCalled('call_5', 'mcp_taskflow__create_task', { title: '买咖啡豆' }),
      toolOutput('call_5', 'mcp_taskflow__create_task', '{"id":"9","title":"买咖啡豆"}'),
    ])
    expect(create.slice(-2)).toEqual([
      { event: 'tool_end', data: { id: 'call_5', ok: true, summary: '已创建「买咖啡豆」' } },
      { event: 'invalidate', data: { resource: 'tasks', op: 'create_task' } },
    ])

    const failed = mapAll(mapper, [
      toolCalled('call_6', 'mcp_taskflow__delete_task', { id: 'x' }),
      toolOutput('call_6', 'mcp_taskflow__delete_task', '{"error":"找不到 id 为 x 的任务"}'),
    ])
    expect(failed.at(-1)).toEqual({
      event: 'tool_end',
      data: { id: 'call_6', ok: false, summary: '失败：找不到 id 为 x 的任务' },
    })
  })
})

describe('toWireUsage', () => {
  it('SDK 的 Usage → 四种 token；每次请求的 cached_tokens 加起来，算作缓存读', () => {
    const usage = {
      inputTokens: 300,
      outputTokens: 40,
      inputTokensDetails: [{ cached_tokens: 100 }, { cached_tokens: 50 }],
    }
    expect(toWireUsage(usage)).toEqual({
      input_tokens: 150,
      output_tokens: 40,
      cache_read_input_tokens: 150,
      cache_creation_input_tokens: 0,
    })
    expect(toWireUsage(undefined).input_tokens).toBe(0)
  })
})
