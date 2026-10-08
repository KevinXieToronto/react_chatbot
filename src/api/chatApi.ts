import { parseSSE } from '../lib/sse'
import { DiffPreviewSchema } from '../lib/diff'
import type { DiffPreview } from '../lib/diff'
import type { ChatMode, WireMessage } from '../types/chat'

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

interface SendOptions {
  signal?: AbortSignal
  /** 对话模式，默认 tasks（第 29 章新增） */
  mode?: ChatMode
}

/**
 * 发起流式对话。返回一个异步生成器，逐个产出事件。
 *
 * 用 fetch 而不是我们的 axios 实例：axios 默认的浏览器适配器基于 XMLHttpRequest，
 * 拿不到 ReadableStream（只能等全部接收完再给你完整的响应）。
 * axios 1.7+ 有一个 fetch 适配器（adapter: 'fetch' + responseType: 'stream'）可以流式读取，
 * 但那底下还是 fetch —— 只为这一个接口，直接用 fetch 更简单直接。
 */
export async function* streamChat(
  messages: WireMessage[],
  { signal, mode = 'tasks' }: SendOptions = {},
): AsyncGenerator<ChatStreamEvent> {
  // 用第 20 章配的 VITE_API_BASE_URL 拼地址，而不是硬编码 '/api'——
  // 生产环境这个变量是完整的后端域名，硬编码 '/api' 会打到前端自己的域名上。
  const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, mode }),
    signal,
  })

  // 出错时后端还没开始流，返回的是普通 JSON
  if (!res.ok) {
    let message = `请求失败（${res.status}）`
    let kind: string | undefined
    try {
      const body = await res.json()
      if (body?.message) message = body.message
      if (body?.kind) kind = String(body.kind)
    } catch {
      /* 响应不是 JSON，用默认文案 */
    }
    yield { type: 'error', message, kind }
    return
  }

  if (!res.body) {
    yield { type: 'error', message: '浏览器不支持流式响应' }
    return
  }

  for await (const evt of parseSSE(res.body, signal)) {
    const d = evt.data as Record<string, unknown>

    switch (evt.event) {
      case 'delta':
        yield { type: 'delta', text: String(d.text ?? '') }
        break
      case 'tool_start':
        yield {
          type: 'tool_start',
          id: String(d.id),
          name: String(d.name),
          input: d.input,
        }
        break
      case 'tool_end':
        yield {
          type: 'tool_end',
          id: String(d.id),
          ok: Boolean(d.ok),
          summary: String(d.summary ?? ''),
        }
        break
      case 'invalidate':
        yield {
          type: 'invalidate',
          resource: String(d.resource ?? ''),
          op: String(d.op ?? ''),
          task: d.task as Record<string, unknown> | undefined,
          path: typeof d.path === 'string' ? d.path : undefined,
        }
        break
      case 'done':
        yield {
          type: 'done',
          stopReason: String(d.stopReason ?? 'end_turn'),
          usage: d.usage as TokenUsage | undefined,
        }
        break
      case 'error':
        yield {
          type: 'error',
          message: String(d.message ?? '出错了'),
          kind: d.kind ? String(d.kind) : undefined,
        }
        break
      case 'approval_required':
        yield {
          type: 'approval_required',
          approvalId: String(d.approvalId),
          toolUseId: String(d.toolUseId),
          name: String(d.name),
          input: d.input,
          reason: typeof d.reason === 'string' ? d.reason : undefined,
          timeoutMs: Number(d.timeoutMs) || 120_000,
          // 格式不对就当没有预览（卡片会退回显示原始参数），别让一个坏数据把页面搞崩
          preview: DiffPreviewSchema.safeParse(d.preview).data,
        }
        break
      case 'approval_resolved':
        yield {
          type: 'approval_resolved',
          approvalId: String(d.approvalId),
          toolUseId: String(d.toolUseId),
          decision: d.decision === 'allow' ? 'allow' : 'deny',
          by: d.by === 'timeout' ? 'timeout' : 'user',
        }
        break
      case 'tool_output':
        yield {
          type: 'tool_output',
          toolUseId: String(d.toolUseId),
          stream: d.stream === 'stderr' ? 'stderr' : 'stdout',
          chunk: String(d.chunk ?? ''),
        }
        break
      case 'context':
        yield {
          type: 'context',
          tokens: Number(d.tokens) || 0,
          before: Number(d.before) || 0,
          budget: Number(d.budget) || 0,
          exact: d.exact === true,
          truncated: Number(d.truncated) || 0,
          dropped: Number(d.dropped) || 0,
          summarized: d.summarized === true,
        }
        break
      // 未知事件忽略 —— 后端以后加新事件不会让旧前端崩
    }
  }
}

/**
 * 回传审批结果（第 30 章）。
 *
 * keepalive: true —— 用户点"停止"时我们会先发拒绝、紧接着中止流式请求；
 * 带上 keepalive，这个小请求即使页面马上卸载 / 连接被中止也会发出去。
 */
export async function submitApproval(
  approvalId: string,
  decision: 'allow' | 'deny',
  note = '',
): Promise<void> {
  const res = await fetch(
    `${import.meta.env.VITE_API_BASE_URL}/chat/approvals/${encodeURIComponent(approvalId)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision, note }),
      keepalive: true,
    },
  )
  if (!res.ok) {
    let message = `提交失败（${res.status}）`
    try {
      const body = await res.json()
      if (body?.message) message = body.message
    } catch {
      /* 不是 JSON，用默认文案 */
    }
    throw new Error(message)
  }
}
