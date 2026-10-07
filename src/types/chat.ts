/** 一条消息在 UI 上的状态 */
export type MessageStatus =
  | 'streaming' // 正在流式输出中（第 22 章用）
  | 'complete' // 完成
  | 'error' // 出错了
  | 'aborted' // 被用户中止（第 24 章用）

/** 工具调用的可视化状态（第 25 章用） */
export interface ToolCall {
  id: string
  name: string
  input: unknown
  status: 'running' | 'success' | 'error'
  /** 给用户看的一句话总结，不是原始 JSON */
  summary?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  status: MessageStatus
  /** 这一轮里模型调用了哪些工具 */
  toolCalls?: ToolCall[]
  /** 出错时的信息 */
  error?: string
  /** 错误类型：retryable / input / config（第 28 章） */
  errorKind?: string
}

/** 发给后端的精简格式 —— 只有 API 需要的字段 */
export interface WireMessage {
  role: 'user' | 'assistant'
  content: string
}

export function toWire(messages: ChatMessage[]): WireMessage[] {
  return messages
    // 出错和被中止的消息不该进上下文，不然模型会被半截内容带偏
    .filter((m) => m.status === 'complete')
    .map((m) => ({ role: m.role, content: m.content }))
}
