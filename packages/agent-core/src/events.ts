import type { DiffPreview } from './diff'
import type { PendingApproval } from './chat'

/**
 * 一次请求的 token 用量（第 33 章补全了缓存的两项）。
 * 输入总量 = input_tokens + cache_read_input_tokens + cache_creation_input_tokens
 *
 * 服务端用的是 OpenAI，它的 usage 由服务端换算成这个形状（server/agent/openai.js 的 toUsage）
 */
export interface TokenUsage {
  /** 没命中缓存、按全价计费的输入 */
  input_tokens?: number
  output_tokens?: number
  /** 从缓存里读的输入（按折扣价计费） */
  cache_read_input_tokens?: number
  /** 这次写进缓存的输入。OpenAI 写缓存不额外收费、也不单独报数，所以一直是 0 */
  cache_creation_input_tokens?: number
}

/** 服务端每次调用模型前的上下文情况（第 33 章） */
export interface ContextReport {
  /** 整理之后发给模型的 token 数 */
  tokens: number
  /** 整理之前的 token 数 */
  before: number
  budget: number
  /** true = 调 OpenAI 的计数接口精确计数；false = 粗略估算（Mock 模式） */
  exact: boolean
  /** 截断了几个旧工具结果 */
  truncated: number
  /** 删掉了几条旧消息 */
  dropped: number
  /** 删掉的部分有没有生成摘要 */
  summarized: boolean
}

/** 后端推过来的事件，前端只认这几种 */
export type ChatStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'tool_start'; id: string; name: string; input: unknown }
  | { type: 'tool_end'; id: string; ok: boolean; summary: string }
  | {
      type: 'invalidate'
      resource: string
      op: string
      /** resource === 'tasks' 时：变更后的任务 */
      task?: Record<string, unknown>
      /** resource === 'files' 时：被改动的文件路径 */
      path?: string
    }
  | {
      type: 'done'
      stopReason: string
      usage?: TokenUsage
    }
  | { type: 'error'; message: string; kind?: string }
  // ── 第 30 章：人在回路 ──
  | {
      type: 'approval_required'
      approvalId: string
      toolUseId: string
      name: string
      input: unknown
      reason?: string
      /** 服务端多久后自动拒绝（毫秒） */
      timeoutMs: number
      /** 第 31 章：服务端算好的 diff */
      preview?: DiffPreview
    }
  | {
      type: 'approval_resolved'
      approvalId: string
      toolUseId: string
      decision: 'allow' | 'deny'
      /** user = 用户点的；timeout = 超时自动拒绝 */
      by: 'user' | 'timeout'
    }
  // ── 第 32 章：命令的实时输出 ──
  | {
      type: 'tool_output'
      /** 属于哪一次工具调用（ToolCall.id） */
      toolUseId: string
      stream: 'stdout' | 'stderr'
      /** 一段原样的终端输出，可能带 ANSI 颜色代码 */
      chunk: string
    }
  // ── 第 33 章：上下文管理 ──
  | ({ type: 'context' } & ContextReport)

/** 数据变更事件，单独导出给 onInvalidate 回调用 */
export type InvalidateEvent = Extract<ChatStreamEvent, { type: 'invalidate' }>

/** 命令输出事件，单独导出给 onToolOutput 回调用（第 32 章） */
export type ToolOutputEvent = Extract<ChatStreamEvent, { type: 'tool_output' }>

/** 审批请求事件（第 30 章） */
export type ApprovalRequiredEvent = Extract<ChatStreamEvent, { type: 'approval_required' }>

/**
 * 审批事件 → 状态机里的 PendingApproval。
 * 过期时间用本地时钟换算：服务端和客户端的时钟不一定对得上。
 */
export function toPendingApproval(evt: ApprovalRequiredEvent, now: number = Date.now()): PendingApproval {
  return {
    approvalId: evt.approvalId,
    toolUseId: evt.toolUseId,
    name: evt.name,
    input: evt.input,
    reason: evt.reason,
    preview: evt.preview,
    expiresAt: now + evt.timeoutMs,
  }
}
