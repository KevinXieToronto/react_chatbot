import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup } from 'ink-testing-library'
import { App } from './App'
import type { ChatStreamEvent, StreamChat } from '@taskflow/agent-core'
import { createStreamChat } from './api'

/** 每个测试一个临时的历史文件，不碰你主目录里真正的历史 */
function tempHistory(entries: string[] = []): string {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'taskflow-')), 'history.json')
  fs.writeFileSync(file, JSON.stringify(entries))
  return file
}

/** 渲染 App；没指定历史文件时用一个临时的 */
function renderApp(props: ComponentProps<typeof App>) {
  return render(<App historyFile={tempHistory()} {...props} />)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** 模拟用户：先打字，再按回车。每步之间留一点时间让 Ink 处理输入、重新渲染 */
async function typeAndSubmit(stdin: { write: (s: string) => void }, text: string) {
  await sleep(50)
  stdin.write(text)
  await sleep(50)
  stdin.write('\r')
}

/** 一个假的后端：按顺序吐出事件，每个之间停 10ms */
function fakeStream(events: ChatStreamEvent[]): StreamChat {
  return async function* () {
    for (const e of events) {
      await sleep(10)
      yield e
    }
  }
}

afterEach(() => {
  cleanup()
})

describe('App', () => {
  it('启动时显示标题栏和"就绪"', () => {
    const { lastFrame } = renderApp({ stream: fakeStream([]) })
    expect(lastFrame()).toContain('TaskFlow Copilot')
    expect(lastFrame()).toContain('就绪 · 0 条消息')
  })

  it('流式输出文本，并把工具调用显示成一行', async () => {
    const stream = fakeStream([
      { type: 'tool_start', id: 't1', name: 'list_tasks', input: { status: 'todo' } },
      { type: 'tool_end', id: 't1', ok: true, summary: '找到 2 条任务' },
      { type: 'delta', text: '你有 ' },
      { type: 'delta', text: '2 条任务' },
      { type: 'done', stopReason: 'end_turn' },
    ])
    const { stdin, lastFrame } = renderApp({ stream })

    await typeAndSubmit(stdin, '还有哪些任务')

    await vi.waitFor(() => {
      expect(lastFrame()).toContain('就绪 · 2 条消息')
    })
    const frame = lastFrame()!
    expect(frame).toContain('❯ 还有哪些任务')
    expect(frame).toContain('⏺ 查询任务 (list_tasks) ✓ 找到 2 条任务')
    expect(frame).toContain('你有 2 条任务')
  })

  it('输出中按 Esc：中止请求，保留已输出的部分', async () => {
    let aborted = false
    // 吐出一个字之后就一直等，直到被中止
    const stream: StreamChat = async function* (_messages, { signal }) {
      yield { type: 'delta', text: '写到一半' }
      await new Promise<void>((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          aborted = true
          reject(signal.reason)
        })
      })
    }
    const { stdin, lastFrame } = renderApp({ stream })

    await typeAndSubmit(stdin, '你好')
    await vi.waitFor(() => expect(lastFrame()).toContain('写到一半'))
    expect(lastFrame()).toContain('Esc / Ctrl+C 中止')

    stdin.write('\u001B') // Esc

    await vi.waitFor(() => expect(lastFrame()).toContain('（已中止）'))
    expect(aborted).toBe(true)
    expect(lastFrame()).toContain('就绪')
  })

  it('超时算作中止，并提示"响应超时"', async () => {
    const stream: StreamChat = async function* (_messages, { signal }) {
      yield { type: 'delta', text: '想一想' }
      await new Promise<void>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason))
      })
    }
    // 把超时从 120 秒调成 200 毫秒，测试不用干等
    const { stdin, lastFrame } = renderApp({ stream, timeoutMs: 200 })

    await typeAndSubmit(stdin, '你好')

    await vi.waitFor(() => expect(lastFrame()).toContain('（响应超时，已停止）'))
    expect(lastFrame()).toContain('想一想')
  })

  it('回复按 Markdown 渲染：表格画成框，** 不见了', async () => {
    const stream = fakeStream([
      { type: 'delta', text: '你有 **2** 条任务：\n\n| 标题 | 状态 |\n' },
      { type: 'delta', text: '| --- | --- |\n| 写周报 | todo |\n\n完。' },
      { type: 'done', stopReason: 'end_turn' },
    ])
    const { stdin, lastFrame } = renderApp({ stream })
    await typeAndSubmit(stdin, '任务')

    await vi.waitFor(() => expect(lastFrame()).toContain('就绪 · 2 条消息'))
    const frame = lastFrame()!
    expect(frame).toContain('⏺ 你有 2 条任务：')
    expect(frame).toContain('│ 写周报 │ todo │')
    expect(frame).not.toContain('**')
  })

  it('命令运行时显示最后几行输出，结束后只留一句总结', async () => {
    let finish = () => {}
    const gate = new Promise<void>((resolve) => {
      finish = resolve
    })
    const stream: StreamChat = async function* () {
      yield { type: 'tool_start', id: 'c1', name: 'run_command', input: { command: 'npm run build' } }
      yield { type: 'tool_output', toolUseId: 'c1', stream: 'stdout', chunk: '[1/2] 编译 10%\r[1/2] 编译 90%\n' }
      yield { type: 'tool_output', toolUseId: 'c1', stream: 'stdout', chunk: '[2/2] 写入 …' }
      await gate
      yield { type: 'tool_end', id: 'c1', ok: true, summary: '退出码 0' }
      yield { type: 'done', stopReason: 'end_turn' }
    }
    const { stdin, lastFrame } = renderApp({ stream })
    await typeAndSubmit(stdin, '跑一下构建')

    await vi.waitFor(() => expect(lastFrame()).toContain('⎿ [1/2] 编译 90%'))
    expect(lastFrame()).toContain('[2/2] 写入 …')
    expect(lastFrame()).not.toContain('编译 10%')

    finish()
    await vi.waitFor(() => expect(lastFrame()).toContain('⏺ 运行命令 (run_command) ✓ 退出码 0'))
    expect(lastFrame()).not.toContain('⎿')
  })

  it('状态栏显示上下文大小、缓存命中率和累计费用（第 33 章）', async () => {
    const stream = fakeStream([
      { type: 'context', tokens: 1314, before: 1314, budget: 100000, exact: false, truncated: 0, dropped: 0, summarized: false },
      { type: 'delta', text: '好的' },
      {
        type: 'done',
        stopReason: 'end_turn',
        usage: { input_tokens: 0, output_tokens: 100, cache_read_input_tokens: 950, cache_creation_input_tokens: 50 },
      },
    ])
    const { stdin, lastFrame } = renderApp({ stream })
    await typeAndSubmit(stdin, '你好')

    await vi.waitFor(() => expect(lastFrame()).toContain('就绪 · 2 条消息'))
    expect(lastFrame()).toContain('上下文 ≈1,314 / 100,000')
    expect(lastFrame()).toContain('缓存命中 95%')
  })
})

describe('输入与命令（第 38 章）', () => {
  it('/help 只在本地显示，不会发给模型', async () => {
    const stream = vi.fn(fakeStream([]))
    const { stdin, lastFrame } = renderApp({ stream })
    await typeAndSubmit(stdin, '/help')

    await vi.waitFor(() => expect(lastFrame()).toContain('/mode tasks|code|sdk'))
    expect(stream).not.toHaveBeenCalled()
    expect(lastFrame()).toContain('就绪 · 0 条消息')
  })

  it('/mode code 之后，请求里带上 mode；状态栏显示当前模式', async () => {
    const stream = vi.fn(fakeStream([{ type: 'done', stopReason: 'end_turn' }]))
    const { stdin, lastFrame } = renderApp({ stream })
    expect(lastFrame()).toContain('[tasks]')

    await typeAndSubmit(stdin, '/mode code')
    await vi.waitFor(() => expect(lastFrame()).toContain('[code]'))
    expect(lastFrame()).toContain('已切换到 code 模式')

    await typeAndSubmit(stdin, '列出文件')
    await vi.waitFor(() => expect(stream).toHaveBeenCalled())
    expect(stream.mock.calls[0][1]).toMatchObject({ mode: 'code' })
  })

  it('不认识的命令：提示，而不是发给模型', async () => {
    const stream = vi.fn(fakeStream([]))
    const { stdin, lastFrame } = renderApp({ stream })
    await typeAndSubmit(stdin, '/deploy')

    await vi.waitFor(() => expect(lastFrame()).toContain('没有 /deploy 这个命令'))
    expect(stream).not.toHaveBeenCalled()
  })

  it('输入 / 时出现补全提示，Tab 补全', async () => {
    const { stdin, lastFrame } = renderApp({ stream: fakeStream([]) })
    await sleep(50)
    stdin.write('/mo')
    await vi.waitFor(() => expect(lastFrame()).toContain('Tab 补全'))
    stdin.write('\t')
    await vi.waitFor(() => expect(lastFrame()).toContain('/mode tasks|code|sdk —— 切换模式'))
  })

  it('↑ 翻出历史文件里的上一条；Esc 清空输入', async () => {
    const { stdin, lastFrame } = renderApp({ stream: fakeStream([]), historyFile: tempHistory(['上一次问的问题']) })
    await sleep(50)
    stdin.write('\u001B[A') // ↑
    await vi.waitFor(() => expect(lastFrame()).toContain('❯ 上一次问的问题'))
    stdin.write('\u001B') // Esc
    await vi.waitFor(() => expect(lastFrame()).toContain('输入消息，Enter 发送'))
  })

  it('发出去的话会写进历史文件', async () => {
    const file = tempHistory()
    const { stdin } = renderApp({ stream: fakeStream([{ type: 'done', stopReason: 'end_turn' }]), historyFile: file })
    await typeAndSubmit(stdin, '记住这一句')
    await vi.waitFor(() => expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual(['记住这一句']))
  })
})

describe('streamChat', () => {
  it('后端没启动时给出友好提示，而不是抛异常', async () => {
    // 3999 端口上没有服务在监听，连接会被拒绝（ECONNREFUSED）
    const url = 'http://127.0.0.1:3999'
    const signal = new AbortController().signal
    const events: ChatStreamEvent[] = []
    for await (const e of createStreamChat(url)([{ role: 'user', content: 'hi' }], { signal })) {
      events.push(e)
    }
    expect(events).toEqual([
      { type: 'error', message: `连不上后端 ${url}。先在项目根目录运行 npm run server，再重试。` },
    ])
  })
})
