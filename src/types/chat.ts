import type { ChatMessage } from '@taskflow/agent-core'
import type { UsageTotals } from '../lib/tokenCost'

// 第 36 章：消息、工具调用、审批这些"两端通用"的类型搬进了共享核心。
// 这里原样转发，网页端各个组件的 import 路径一个都不用改。
export type {
  MessageStatus,
  ToolCall,
  ChatMessage,
  PendingApproval,
  WireMessage,
  ChatMode,
} from '@taskflow/agent-core'
export { toWire } from '@taskflow/agent-core'

/**
 * useChat 需要的"消息存储"接口 —— 这个只有网页端有，所以留在这里。
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
  /** 一轮结束时累加 token 用量。第 33 章起带上缓存读 / 写（以前只有输入、输出） */
  addUsage?: (usage: UsageTotals) => void
}
