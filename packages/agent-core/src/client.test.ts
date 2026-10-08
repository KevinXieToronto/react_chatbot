import { describe, it, expect } from 'vitest'
import { ConnectionError, UnauthorizedError, createAgentClient, isAbortError } from './client'
import type { ChatStreamEvent } from './events'

/** 一个假的 fetch：记下请求，返回事先准备好的响应 */
function fakeFetch(respond: () => Response) {
  const calls: { url: string; init?: RequestInit }[] = []
  const fetch: typeof globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), init })
    return respond()
  }
  return { fetch, calls }
}

function sseResponse(body: string): Response {
  return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } })
}

async function collect(gen: AsyncGenerator<ChatStreamEvent>): Promise<ChatStreamEvent[]> {
  const out: ChatStreamEvent[] = []
  for await (const e of gen) out.push(e)
  return out
}

const signal = new AbortController().signal

describe('createAgentClient().streamChat', () => {
  it('把 SSE 翻译成类型化的事件，请求体带上 mode', async () => {
    const { fetch, calls } = fakeFetch(() =>
      sseResponse(
        'event: tool_output\ndata: {"toolUseId":"t1","stream":"stderr","chunk":"x"}\n\n' +
          'event: some_future_event\ndata: {}\n\n' +
          'event: done\ndata: {"stopReason":"end_turn"}\n\n',
      ),
    )
    const client = createAgentClient({ baseUrl: 'http://api.test', fetch, headers: { 'x-taskflow-token': 't0k' } })

    const events = await collect(client.streamChat([{ role: 'user', content: 'hi' }], { signal, mode: 'code' }))

    expect(events).toEqual([
      { type: 'tool_output', toolUseId: 't1', stream: 'stderr', chunk: 'x' },
      // 不认识的事件被忽略
      { type: 'done', stopReason: 'end_turn', usage: undefined },
    ])
    expect(calls[0].url).toBe('http://api.test/chat')
    // 宿主传进来的请求头（令牌）原样带上，Content-Type 也还在
    expect(calls[0].init?.headers).toEqual({ 'Content-Type': 'application/json', 'x-taskflow-token': 't0k' })
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      messages: [{ role: 'user', content: 'hi' }],
      mode: 'code',
    })
  })

  it('格式不对的 diff 预览被丢掉，而不是让界面崩掉', async () => {
    const { fetch } = fakeFetch(() =>
      sseResponse(
        'event: approval_required\ndata: {"approvalId":"a1","toolUseId":"t1","name":"edit_file","input":{},"timeoutMs":5000,"preview":{"path":1}}\n\n',
      ),
    )
    const client = createAgentClient({ baseUrl: '', fetch })
    const [evt] = await collect(client.streamChat([], { signal }))
    expect(evt).toMatchObject({ type: 'approval_required', approvalId: 'a1', preview: undefined })
  })

  it('非 2xx：产出一条 error 事件，带上后端给的 message 和 kind；401 的 kind 统一是 unauthorized', async () => {
    const { fetch } = fakeFetch(() => Response.json({ kind: 'input', message: 'messages 不能为空' }, { status: 400 }))
    const client = createAgentClient({ baseUrl: '', fetch })
    expect(await collect(client.streamChat([], { signal }))).toEqual([
      { type: 'error', message: 'messages 不能为空', kind: 'input' },
    ])

    const denied = createAgentClient({ baseUrl: '', fetch: fakeFetch(() => Response.json({ message: '未授权' }, { status: 401 })).fetch })
    expect(await collect(denied.streamChat([], { signal }))).toEqual([
      { type: 'error', message: '未授权', kind: 'unauthorized' },
    ])
  })

  it('连不上：抛 ConnectionError；中止：原样抛 AbortError', async () => {
    const refused = createAgentClient({
      baseUrl: 'http://down.test',
      fetch: async () => {
        throw new TypeError('fetch failed')
      },
    })
    await expect(collect(refused.streamChat([], { signal }))).rejects.toBeInstanceOf(ConnectionError)

    const aborted = createAgentClient({
      baseUrl: '',
      fetch: async () => {
        throw new DOMException('aborted', 'AbortError')
      },
    })
    const err = await collect(aborted.streamChat([], { signal })).catch((e: unknown) => e)
    expect(isAbortError(err)).toBe(true)
  })
})

describe('createAgentClient().submitApproval', () => {
  it('POST 到 /chat/approvals/:id 并带上请求头；404 时把后端的 message 抛出来；401 抛 UnauthorizedError', async () => {
    const { fetch, calls } = fakeFetch(() => Response.json({ message: '审批不存在或已过期' }, { status: 404 }))
    const client = createAgentClient({ baseUrl: 'http://api.test', fetch, headers: { 'x-taskflow-token': 't0k' } })

    await expect(client.submitApproval('a/1', 'deny', '别改')).rejects.toThrow('审批不存在或已过期')
    expect(calls[0].url).toBe('http://api.test/chat/approvals/a%2F1')
    expect(calls[0].init?.headers).toMatchObject({ 'x-taskflow-token': 't0k' })
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ decision: 'deny', note: '别改' })

    const denied = createAgentClient({ baseUrl: '', fetch: fakeFetch(() => Response.json({ message: '未授权' }, { status: 401 })).fetch })
    await expect(denied.submitApproval('a1', 'allow')).rejects.toBeInstanceOf(UnauthorizedError)
  })
})
