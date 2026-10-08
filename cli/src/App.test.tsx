import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup } from 'ink-testing-library'
import { App } from './App'
import type { ChatStreamEvent, StreamChat } from '@taskflow/agent-core'
import { createStreamChat } from './api'

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
    const { lastFrame } = render(<App stream={fakeStream([])} />)
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
    const { stdin, lastFrame } = render(<App stream={stream} />)

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
    const { stdin, lastFrame } = render(<App stream={stream} />)

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
    const { stdin, lastFrame } = render(<App stream={stream} timeoutMs={200} />)

    await typeAndSubmit(stdin, '你好')

    await vi.waitFor(() => expect(lastFrame()).toContain('（响应超时，已停止）'))
    expect(lastFrame()).toContain('想一想')
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
