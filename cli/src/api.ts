// 直接复用网页端的 SSE 解析器：它只用到 TextDecoder / ReadableStream，
// 这些在 Node 18+ 里都是全局对象，一行都不用改。
import { parseSSE } from '../../src/lib/sse'
import type { WireMessage } from '../../src/types/chat'
import { TOKEN_HEADER, UNAUTHORIZED_MESSAGE, resolveToken } from './token'

/** 终端版只关心这几种事件；invalidate 是给网页刷新缓存用的，这里用不上 */
export type ChatEvent =
  | { type: 'delta'; text: string }
  | { type: 'tool_start'; id: string; name: string; input: unknown }
  | { type: 'tool_end'; id: string; ok: boolean; summary: string }
  | { type: 'done'; stopReason: string }
  | { type: 'error'; message: string }

/** 流式函数的"形状"。App 通过 props 接收它，测试时可以换成假的 */
export type StreamChat = (
  messages: WireMessage[],
  signal: AbortSignal,
) => AsyncGenerator<ChatEvent>

/** 后端地址：默认直连 3001（终端里没有 Vite 代理），可用环境变量覆盖 */
export const API_URL = process.env.TASKFLOW_API_URL ?? 'http://localhost:3001'

/** 访问令牌：有就带，没有就不带（本章对接的第 28 章后端没有令牌校验，第 36 章起必须有） */
export const TOKEN = resolveToken()

/** 用户中止（AbortError）和超时（TimeoutError）都不算真正的错误，见第 24 章 */
export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && (err.name === 'AbortError' || err.name === 'TimeoutError')
}

export async function* streamChat(
  messages: WireMessage[],
  signal: AbortSignal,
  baseUrl: string = API_URL,
  token: string | undefined = TOKEN,
): AsyncGenerator<ChatEvent> {
  let res: Response
  try {
    res = await fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { [TOKEN_HEADER]: token } : {}),
      },
      body: JSON.stringify({ messages }),
      signal,
    })
  } catch (err) {
    // 中止要原样抛出去，让调用方按"已中止"处理
    if (isAbortError(err)) throw err
    // 其余的基本就是连不上：后端没启动、端口写错……
    // Node 的 fetch 这时抛 TypeError('fetch failed')，真正原因在 err.cause 里
    yield {
      type: 'error',
      message: `连不上后端 ${baseUrl}。先在项目根目录运行 npm run server，再重试。`,
    }
    return
  }

  // 限流、输入校验失败时，后端还没开始流，返回的是普通 JSON（第 28 章）
  if (!res.ok) {
    // 401：令牌缺失或不对。给一句能照着做的话，不要只显示"请求失败（401）"
    if (res.status === 401) {
      yield { type: 'error', message: UNAUTHORIZED_MESSAGE }
      return
    }
    let message = `请求失败（${res.status}）`
    try {
      const body = (await res.json()) as { message?: string }
      if (body?.message) message = body.message
    } catch {
      /* 响应不是 JSON，用默认文案 */
    }
    yield { type: 'error', message }
    return
  }

  if (!res.body) {
    yield { type: 'error', message: '响应里没有数据流' }
    return
  }

  for await (const evt of parseSSE(res.body, signal)) {
    const d = (evt.data ?? {}) as Record<string, unknown>

    switch (evt.event) {
      case 'delta':
        yield { type: 'delta', text: String(d.text ?? '') }
        break
      case 'tool_start':
        yield { type: 'tool_start', id: String(d.id), name: String(d.name), input: d.input }
        break
      case 'tool_end':
        yield {
          type: 'tool_end',
          id: String(d.id),
          ok: Boolean(d.ok),
          summary: String(d.summary ?? ''),
        }
        break
      case 'done':
        yield { type: 'done', stopReason: String(d.stopReason ?? 'end_turn') }
        break
      case 'error':
        yield { type: 'error', message: String(d.message ?? '出错了') }
        break
      // invalidate 和以后新增的事件一律忽略 —— 后端升级不会让旧终端崩
    }
  }
}
