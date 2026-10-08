import { ConnectionError, createAgentClient, type StreamChat } from '@taskflow/agent-core'
import { TOKEN_HEADER, UNAUTHORIZED_MESSAGE, resolveToken } from './token'

// 第 36 章：SSE 解析、事件类型、流式请求都来自共享核心。
// 这个文件是终端版的"适配器"：决定后端地址和访问令牌，
// 并把"连不上"、"401"翻译成终端用户看得懂的话。核心不读环境变量，这些都由这里提供。

/** 后端地址：默认直连 3001（终端里没有 Vite 代理），可用环境变量覆盖 */
export const API_URL = process.env.TASKFLOW_API_URL ?? 'http://localhost:3001'

/** 访问令牌（第 30 章）：环境变量 TASKFLOW_TOKEN，或 server/.env 里的 TASKFLOW_TOKEN */
export const TOKEN = resolveToken()

/**
 * 基于核心客户端，造一个终端用的流式函数。
 * 和网页端的区别：令牌由这里放进请求头；连不上后端、401 时不抛异常，
 * 而是产出一条"该怎么办"的 error 事件。
 */
export function createStreamChat(baseUrl: string, token?: string): StreamChat {
  const client = createAgentClient({ baseUrl, headers: token ? { [TOKEN_HEADER]: token } : {} })

  return async function* (messages, options) {
    try {
      for await (const event of client.streamChat(messages, options)) {
        if (event.type === 'error' && event.kind === 'unauthorized') {
          yield { type: 'error', message: UNAUTHORIZED_MESSAGE, kind: 'unauthorized' }
          return
        }
        yield event
      }
    } catch (err) {
      // ConnectionError 只在"建立连接"这一步抛出；中止（AbortError）等其他错误原样往外抛
      if (err instanceof ConnectionError) {
        yield {
          type: 'error',
          message: `连不上后端 ${baseUrl}。先在项目根目录运行 npm run server，再重试。`,
        }
        return
      }
      throw err
    }
  }
}

export const streamChat = createStreamChat(API_URL, TOKEN)
