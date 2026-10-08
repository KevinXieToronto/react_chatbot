import { parseSSE } from './sse'
import { DiffPreviewSchema } from './diff'
import type { ChatMode, WireMessage } from './chat'
import type { ChatStreamEvent, TokenUsage } from './events'

/** 宿主（网页 / 终端 / 测试）创建客户端时提供的配置 —— 核心自己不读任何环境变量 */
export interface AgentClientOptions {
  /** 后端地址，结尾不带 /。网页端是 /api（走 Vite 代理），终端是 http://localhost:3001 */
  baseUrl: string
  /** 不传就用全局 fetch。测试时换成假的，不用真起后端 */
  fetch?: typeof fetch
  /**
   * 每个请求都要带上的额外请求头。核心不知道里面装的是不是访问令牌，
   * 更不会自己去读环境变量或文件 —— 令牌从哪来是宿主的事，宿主把现成的请求头传进来。
   * 网页端不传（令牌由 Vite 代理加，第 30 章），终端版传 { 'x-taskflow-token': … }。
   */
  headers?: Record<string, string>
}

export interface StreamOptions {
  /** 必填：流式请求一定要能取消（第 24 章） */
  signal: AbortSignal
  /** 对话模式，默认 tasks（第 29 章） */
  mode?: ChatMode
}

/** 流式函数的"形状"。网页和终端都通过它发请求，测试时可以换成假的 */
export type StreamChat = (
  messages: WireMessage[],
  options: StreamOptions,
) => AsyncGenerator<ChatStreamEvent>

export type ApprovalDecision = 'allow' | 'deny'

export type SubmitApproval = (
  approvalId: string,
  decision: ApprovalDecision,
  note?: string,
) => Promise<void>

export interface AgentClient {
  streamChat: StreamChat
  submitApproval: SubmitApproval
}

/**
 * 连不上后端（后端没启动、地址写错、断网）。
 * 只在"建立连接"这一步抛出，流读到一半断开不算 —— 宿主可以据此给出"先启动后端"这样的提示。
 * message 保持和原始错误一样（浏览器里是 Failed to fetch），网页端的显示不受影响。
 */
export class ConnectionError extends Error {
  readonly baseUrl: string

  constructor(baseUrl: string, cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause), { cause })
    this.name = 'ConnectionError'
    this.baseUrl = baseUrl
  }
}

/**
 * 后端回了 401：访问令牌缺失或不对（第 30 章）。
 * 核心只负责把"401"这个事实标出来，怎么跟用户说（要设置什么、去哪里设置）由宿主决定。
 */
export class UnauthorizedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

/** 用户中止（AbortError）和超时（TimeoutError）都不算真正的错误，见第 24 章 */
export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && (err.name === 'AbortError' || err.name === 'TimeoutError')
}

/** 出错时后端还没开始流，返回的是普通 JSON：{ message, kind } */
async function readErrorBody(res: Response, fallback: string) {
  let message = fallback
  let kind: string | undefined
  try {
    const body = (await res.json()) as { message?: unknown; kind?: unknown }
    if (body?.message) message = String(body.message)
    if (body?.kind) kind = String(body.kind)
  } catch {
    /* 响应不是 JSON，用默认文案 */
  }
  return { message, kind }
}

/** 一条原始 SSE 事件 → 类型化的事件。不认识的返回 null */
function toStreamEvent(event: string, data: unknown): ChatStreamEvent | null {
  const d = (data ?? {}) as Record<string, unknown>

  switch (event) {
    case 'delta':
      return { type: 'delta', text: String(d.text ?? '') }
    case 'tool_start':
      return { type: 'tool_start', id: String(d.id), name: String(d.name), input: d.input }
    case 'tool_end':
      return { type: 'tool_end', id: String(d.id), ok: Boolean(d.ok), summary: String(d.summary ?? '') }
    case 'invalidate':
      return {
        type: 'invalidate',
        resource: String(d.resource ?? ''),
        op: String(d.op ?? ''),
        task: d.task as Record<string, unknown> | undefined,
        path: typeof d.path === 'string' ? d.path : undefined,
      }
    case 'done':
      return {
        type: 'done',
        stopReason: String(d.stopReason ?? 'end_turn'),
        usage: d.usage as TokenUsage | undefined,
      }
    case 'error':
      return {
        type: 'error',
        message: String(d.message ?? '出错了'),
        kind: d.kind ? String(d.kind) : undefined,
      }
    case 'approval_required':
      return {
        type: 'approval_required',
        approvalId: String(d.approvalId),
        toolUseId: String(d.toolUseId),
        name: String(d.name),
        input: d.input,
        reason: typeof d.reason === 'string' ? d.reason : undefined,
        timeoutMs: Number(d.timeoutMs) || 120_000,
        // 格式不对就当没有预览（界面会退回显示原始参数），别让一个坏数据把界面搞崩
        preview: DiffPreviewSchema.safeParse(d.preview).data,
      }
    case 'approval_resolved':
      return {
        type: 'approval_resolved',
        approvalId: String(d.approvalId),
        toolUseId: String(d.toolUseId),
        decision: d.decision === 'allow' ? 'allow' : 'deny',
        by: d.by === 'timeout' ? 'timeout' : 'user',
      }
    case 'tool_output':
      return {
        type: 'tool_output',
        toolUseId: String(d.toolUseId),
        stream: d.stream === 'stderr' ? 'stderr' : 'stdout',
        chunk: String(d.chunk ?? ''),
      }
    case 'context':
      return {
        type: 'context',
        tokens: Number(d.tokens) || 0,
        before: Number(d.before) || 0,
        budget: Number(d.budget) || 0,
        exact: d.exact === true,
        truncated: Number(d.truncated) || 0,
        dropped: Number(d.dropped) || 0,
        summarized: d.summarized === true,
      }
    default:
      // 未知事件忽略 —— 后端以后加新事件不会让旧客户端崩
      return null
  }
}

/**
 * 创建一个 Agent 客户端。核心只认"地址 + fetch"这两个端口（port），
 * 地址从哪来（Vite 环境变量 / 命令行参数 / 配置文件）是宿主的事。
 */
export function createAgentClient({ baseUrl, fetch: fetchImpl, headers: extraHeaders = {} }: AgentClientOptions): AgentClient {
  // ⚠️ 不要写成 options.fetch(...)：浏览器里 fetch 必须以 window（或 undefined）为 this 调用，
  //    挂在别的对象上调会报 "Illegal invocation"。存进一个局部函数再调就没问题。
  const doFetch: typeof fetch = fetchImpl ?? ((input, init) => globalThis.fetch(input, init))
  const jsonHeaders = { 'Content-Type': 'application/json', ...extraHeaders }

  async function* streamChat(
    messages: WireMessage[],
    { signal, mode = 'tasks' }: StreamOptions,
  ): AsyncGenerator<ChatStreamEvent> {
    let res: Response
    try {
      res = await doFetch(`${baseUrl}/chat`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ messages, mode }),
        signal,
      })
    } catch (err) {
      // 中止要原样抛出去，让调用方按"已中止"处理
      if (isAbortError(err)) throw err
      // 其余的基本就是连不上。浏览器里是 TypeError('Failed to fetch')，
      // Node 里是 TypeError('fetch failed')，真正原因在 err.cause 里
      throw new ConnectionError(baseUrl, err)
    }

    // 限流、输入校验失败时，后端还没开始流，返回的是普通 JSON（第 28 章）
    if (!res.ok) {
      const body = await readErrorBody(res, `请求失败（${res.status}）`)
      // 401 统一标成 kind: 'unauthorized'，宿主据此换成自己的提示
      yield { type: 'error', ...body, kind: res.status === 401 ? 'unauthorized' : body.kind }
      return
    }

    if (!res.body) {
      yield { type: 'error', message: '响应里没有数据流' }
      return
    }

    for await (const evt of parseSSE(res.body, signal)) {
      const typed = toStreamEvent(evt.event, evt.data)
      if (typed) yield typed
    }
  }

  /**
   * 回传审批结果（第 30 章）。
   *
   * keepalive: true —— 用户点"停止"时会先发拒绝、紧接着中止流式请求；
   * 带上 keepalive，浏览器里这个小请求即使页面马上卸载也会发出去。Node 的 fetch 会忽略它。
   */
  async function submitApproval(approvalId: string, decision: ApprovalDecision, note = ''): Promise<void> {
    const res = await doFetch(`${baseUrl}/chat/approvals/${encodeURIComponent(approvalId)}`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ decision, note }),
      keepalive: true,
    })
    if (!res.ok) {
      const { message } = await readErrorBody(res, `提交失败（${res.status}）`)
      throw res.status === 401 ? new UnauthorizedError(message) : new Error(message)
    }
  }

  return { streamChat, submitApproval }
}
