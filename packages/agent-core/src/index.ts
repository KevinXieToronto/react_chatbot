/**
 * @taskflow/agent-core —— 网页端和终端共用的 Agent 核心。
 *
 * 规矩只有一条：这里的代码只能用"两边都有"的东西。
 * 不 import react / ink / DOM / node:*，不读 import.meta.env / process.env。
 * 需要宿主提供的（后端地址、fetch）一律通过参数传进来。
 */
export * from './sse'
export * from './diff'
export * from './tokenCost'
export * from './chat'
export * from './events'
export * from './client'
export * from './turnReducer'
