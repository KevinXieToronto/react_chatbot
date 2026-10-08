// 第 36 章：工具调用状态机搬进了共享核心，网页端和终端跑的是同一份。
// 保留这个文件只为了不改动网页端的 import 路径。
export { turnReducer, initialTurnState, describePhase, TOOL_LABELS } from '@taskflow/agent-core'
export type { TurnPhase, TurnState, TurnAction } from '@taskflow/agent-core'
