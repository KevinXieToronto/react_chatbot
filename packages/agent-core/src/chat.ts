import type { DiffPreview } from './diff'

/** 一条消息在 UI 上的状态 */
export type MessageStatus =
  | 'streaming' // 正在流式输出中
  | 'complete' // 完成
  | 'error' // 出错了
  | 'aborted' // 被用户中止

/** 工具调用的可视化状态 */
export interface ToolCall {
  id: string
  name: string
  input: unknown
  /** awaiting：等待用户审批（第 30 章） */
  status: 'running' | 'awaiting' | 'success' | 'error'
  /** 给用户看的一句话总结，不是原始 JSON */
  summary?: string
  /** 审批时看到的改动（第 31 章）。工具结束后还能展开再看一次 */
  preview?: DiffPreview
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
  /** 错误类型：retryable / input / config */
  errorKind?: string
}

/** 一个等待用户确认的工具调用（第 30 章） */
export interface PendingApproval {
  approvalId: string
  /** 对应哪一个工具调用（ToolCall.id） */
  toolUseId: string
  name: string
  input: unknown
  /** 服务端给的一句话影响说明 */
  reason?: string
  /** 服务端在审批前算好的 diff（第 31 章）。run_command 这类工具没有 */
  preview?: DiffPreview
  /** 什么时候自动过期（本地时间戳，毫秒） */
  expiresAt: number
}

/** 发给后端的精简格式 —— 只有 API 需要的字段 */
export interface WireMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * 对话模式：决定后端用哪套工具和系统提示词。
 * sdk（第 34 章）：还是代码助手，但由 OpenAI Agents SDK 跑循环
 */
export type ChatMode = 'tasks' | 'code' | 'sdk'

export function toWire(messages: ChatMessage[]): WireMessage[] {
  return messages
    // 出错和被中止的消息不该进上下文，不然模型会被半截内容带偏
    .filter((m) => m.status === 'complete')
    .map((m) => ({ role: m.role, content: m.content }))
}
