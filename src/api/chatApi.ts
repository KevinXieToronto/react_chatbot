import { createAgentClient } from '@taskflow/agent-core'

// 第 36 章起，SSE 解析、事件类型、流式请求都搬进了共享核心 @taskflow/agent-core。
// 这个文件变成了网页端的"适配器"：只做一件核心做不了的事 —— 告诉它后端在哪。
export type {
  TokenUsage,
  ContextReport,
  ChatStreamEvent,
  InvalidateEvent,
  ToolOutputEvent,
} from '@taskflow/agent-core'

/**
 * 用第 20 章配的 VITE_API_BASE_URL 拼地址，而不是硬编码 '/api'——
 * 生产环境这个变量是完整的后端域名。
 *
 * import.meta.env 是 Vite 在构建时注入的，只有网页端有，所以它只能出现在适配器里，
 * 不能写进核心（终端版用 tsx 运行，根本没有这个东西）。
 */
const client = createAgentClient({ baseUrl: import.meta.env.VITE_API_BASE_URL })
// 注意这里不传 headers：浏览器里的任何令牌，用户打开开发者工具就能看到。
// 网页端的令牌由 Vite 代理在转发时加上（第 30 章），代码里不出现它。

/**
 * 发起流式对话。返回一个异步生成器，逐个产出事件。
 *
 * 用 fetch 而不是我们的 axios 实例：axios 默认的浏览器适配器基于 XMLHttpRequest，
 * 拿不到 ReadableStream。axios 1.7+ 的 fetch 适配器（adapter: 'fetch'）能流式读取，
 * 但底下还是 fetch —— 只为这一个接口，直接用 fetch 更简单直接。
 */
export const streamChat = client.streamChat

/** 回传审批结果（第 30 章） */
export const submitApproval = client.submitApproval
