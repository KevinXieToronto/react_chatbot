import { parseSSE } from '../lib/sse'
import type { WireMessage } from '../types/chat'

/** 后端推过来的事件，前端只认这几种 */
export type ChatStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'tool_start'; id: string; name: string; input: unknown }
  | { type: 'tool_end'; id: string; ok: boolean; summary: string }
  | {
      type: 'invalidate'
      resource: string
      /** 改数据的工具名：create_task / update_task / delete_task */
      op: string
      task?: Record<string, unknown>
    }
  | {
      type: 'done'
      stopReason: string
      usage?: { input_tokens?: number; output_tokens?: number }
    }
  | { type: 'error'; message: string; kind?: string }

interface SendOptions {
  signal?: AbortSignal
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
  { signal }: SendOptions = {},
): AsyncGenerator<ChatStreamEvent> {
  // 用第 20 章配的 VITE_API_BASE_URL 拼地址，而不是硬编码 '/api'——
  // 生产环境这个变量是完整的后端域名，硬编码 '/api' 会打到前端自己的域名上。
  const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
    signal,
  })

  // 出错时后端还没开始流，返回的是普通 JSON
  // 限流（429）和输入校验（400）都是在开流之前用普通 JSON 返回的，kind 也要从这里取
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
        }
        break
      case 'done':
        yield {
          type: 'done',
          stopReason: String(d.stopReason ?? 'end_turn'),
          usage: d.usage as { input_tokens?: number; output_tokens?: number } | undefined,
        }
        break
      case 'error':
        yield {
          type: 'error',
          message: String(d.message ?? '出错了'),
          kind: d.kind ? String(d.kind) : undefined,
        }
        break
      // 未知事件忽略 —— 后端以后加新事件不会让旧前端崩
    }
  }
}
