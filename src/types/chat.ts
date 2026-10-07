import type { DiffPreview } from '../lib/diff'

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

/** 对话模式：决定后端用哪套工具和系统提示词 */
export type ChatMode = 'tasks' | 'code'

/**
 * useChat 需要的"消息存储"接口。
 *
 * Copilot 的消息存在 copilotStore（多会话、持久化），
 * 代码助手的消息存在 codeStore（单会话、不持久化）。
 * useChat 只依赖这个接口，不关心消息到底存在哪。
 */
export interface ChatSession {
  messages: ChatMessage[]
  /** 现取最新的消息，不经过渲染闭包（retry 截断后立刻 send，闭包里还是旧的）。必须是稳定引用 */
  getMessages: () => ChatMessage[]
  addMessage: (message: ChatMessage) => void
  patchMessage: (id: string, patch: Partial<ChatMessage>) => void
  truncateFrom: (messageId: string) => void
  setBusy: (busy: boolean) => void
  addUsage?: (input: number, output: number) => void
}

export function toWire(messages: ChatMessage[]): WireMessage[] {
  return messages
    // 出错和被中止的消息不该进上下文，不然模型会被半截内容带偏
    .filter((m) => m.status === 'complete')
    .map((m) => ({ role: m.role, content: m.content }))
}
