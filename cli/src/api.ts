import {
  ConnectionError,
  UnauthorizedError,
  createAgentClient,
  type AgentClient,
  type StreamChat,
} from '@taskflow/agent-core'
import { TOKEN_HEADER, UNAUTHORIZED_MESSAGE, resolveToken } from './token'

// 第 36 章：SSE 解析、事件类型、流式请求都来自共享核心。
// 这个文件是终端版的"适配器"：决定后端地址和访问令牌，
// 并把"连不上"、"401"翻译成终端用户看得懂的话。核心不读环境变量，这些都由这里提供。

/** 后端地址：默认直连 3001（终端里没有 Vite 代理），可用环境变量覆盖 */
export const API_URL = process.env.TASKFLOW_API_URL ?? 'http://localhost:3001'

/** 访问令牌（第 30 章）：环境变量 TASKFLOW_TOKEN，或 server/.env 里的 TASKFLOW_TOKEN */
export const TOKEN = resolveToken()

/**
 * 基于核心客户端，造一个终端用的客户端（第 39 章起还要回传审批，所以返回整个 client）。
 * 和网页端的区别：令牌由这里放进请求头（流式对话和审批回传都带）；
 * 连不上后端、401 时不抛异常（审批回传的 401 抛带提示的 Error），而是给出"该怎么办"的提示。
 */
export function createCliClient(baseUrl: string, token?: string): AgentClient {
  const client = createAgentClient({ baseUrl, headers: token ? { [TOKEN_HEADER]: token } : {} })

  const streamChat: StreamChat = async function* (messages, options) {
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

  const submitApproval: AgentClient['submitApproval'] = async (approvalId, decision, note) => {
    try {
      await client.submitApproval(approvalId, decision, note)
    } catch (err) {
      if (err instanceof UnauthorizedError) throw new Error(UNAUTHORIZED_MESSAGE, { cause: err })
      throw err
    }
  }

  return { streamChat, submitApproval }
}

export const cliClient = createCliClient(API_URL, TOKEN)
