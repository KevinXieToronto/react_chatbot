import type { PendingApproval, ToolCall } from '../../types/chat'

/** 一轮对话所处的阶段 */
export type TurnPhase =
  | 'idle' // 没在跑
  | 'thinking' // 请求已发出，还没收到任何内容
  | 'streaming' // 正在输出文本
  | 'tooling' // 至少有一个工具在跑
  | 'awaiting_approval' // 停下来等用户批准某个工具（第 30 章）
  | 'done'
  | 'error'
  | 'aborted'

/**
 * 注意这里【没有】文本内容（第 25 章）：网页端的文本走第 22 章的 rAF 缓冲直接写进 store 里的消息，
 * reducer 只管"现在处在哪个阶段、有哪些工具在跑"。
 * 要是把每个 token 也拼进 reducer，每来一个 token 就多一次整个面板的重渲染。
 */
export interface TurnState {
  phase: TurnPhase
  toolCalls: ToolCall[]
  error: string | null
  /** 正在等待用户确认的审批。编码工具串行执行，所以同一时刻最多一个 */
  approval: PendingApproval | null
}

export const initialTurnState: TurnState = {
  phase: 'idle',
  toolCalls: [],
  error: null,
  approval: null,
}

export type TurnAction =
  | { type: 'start' }
  | { type: 'delta'; text: string }
  | { type: 'tool_start'; id: string; name: string; input: unknown }
  | { type: 'tool_end'; id: string; ok: boolean; summary: string }
  | { type: 'approval_required'; approval: PendingApproval }
  | { type: 'approval_resolved'; approvalId: string }
  | { type: 'done' }
  | { type: 'error'; message: string }
  | { type: 'abort' }

/**
 * 纯函数：不改入参、不做副作用、同输入同输出。
 * 因为是纯的，可以直接写单元测试，完全不用渲染组件。
 */
export function turnReducer(state: TurnState, action: TurnAction): TurnState {
  switch (action.type) {
    case 'start':
      // 每轮都从干净状态开始
      return { ...initialTurnState, phase: 'thinking' }

    case 'delta': {
      // 收到文本就说明不在"纯思考"了。
      // 但如果还有工具在跑（或在等审批），阶段不变
      const phase = activePhase(state.toolCalls, state.approval)
      // 阶段没变就原样返回同一个对象 —— 调用方据此判断"什么都没变"，省掉一次渲染
      return phase === state.phase ? state : { ...state, phase }
    }

    case 'tool_start': {
      const toolCalls = [
        ...state.toolCalls,
        { id: action.id, name: action.name, input: action.input, status: 'running' as const },
      ]
      return { ...state, toolCalls, phase: activePhase(toolCalls, state.approval) }
    }

    case 'tool_end': {
      const toolCalls = state.toolCalls.map((t) =>
        t.id === action.id
          ? { ...t, status: action.ok ? ('success' as const) : ('error' as const), summary: action.summary }
          : t,
      )
      return {
        ...state,
        toolCalls,
        // 还有别的工具在跑就保持 tooling，否则回到 streaming
        phase: activePhase(toolCalls, state.approval),
      }
    }

    case 'approval_required': {
      const toolCalls = state.toolCalls.map((t) =>
        t.id === action.approval.toolUseId ? { ...t, status: 'awaiting' as const } : t,
      )
      return { ...state, toolCalls, approval: action.approval, phase: 'awaiting_approval' }
    }

    case 'approval_resolved': {
      // 不是当前这个审批的"迟到"事件，忽略
      if (state.approval?.approvalId !== action.approvalId) return state

      const toolUseId = state.approval.toolUseId
      // 回到 running：允许的话接下来真正执行，拒绝的话马上会收到 tool_end(ok: false)
      const toolCalls = state.toolCalls.map((t) =>
        t.id === toolUseId && t.status === 'awaiting' ? { ...t, status: 'running' as const } : t,
      )
      return { ...state, toolCalls, approval: null, phase: activePhase(toolCalls, null) }
    }

    case 'done':
      return { ...state, phase: 'done', approval: null }

    case 'error':
      return {
        ...state,
        phase: 'error',
        error: action.message,
        approval: null,
        toolCalls: cancelPending(state.toolCalls),
      }

    case 'abort':
      return {
        ...state,
        phase: 'aborted',
        approval: null,
        // 中止时把还在跑 / 还在等审批的工具标成 error，不然它们会永远转圈
        toolCalls: cancelPending(state.toolCalls),
      }

    default: {
      // 穷尽性检查：以后加了新 action 忘了处理，这里会编译报错
      const _exhaustive: never = action
      return _exhaustive
    }
  }
}

/** 进行中的阶段：等审批 > 有工具在跑 > 输出文本 */
function activePhase(toolCalls: ToolCall[], approval: PendingApproval | null): TurnPhase {
  if (approval) return 'awaiting_approval'
  return toolCalls.some((t) => t.status === 'running') ? 'tooling' : 'streaming'
}

function cancelPending(toolCalls: ToolCall[]): ToolCall[] {
  return toolCalls.map((t) =>
    t.status === 'running' || t.status === 'awaiting'
      ? { ...t, status: 'error' as const, summary: '已取消' }
      : t,
  )
}

/** 给 UI 用的一句话状态描述 */
export function describePhase(state: TurnState): string | null {
  switch (state.phase) {
    case 'thinking':
      return '正在思考…'
    case 'awaiting_approval':
      return state.approval
        ? `等你确认：${TOOL_LABELS[state.approval.name] ?? state.approval.name}`
        : '等你确认…'
    case 'tooling': {
      const running = state.toolCalls.filter((t) => t.status === 'running')
      if (running.length === 0) return null
      return running.length === 1
        ? `正在${TOOL_LABELS[running[0].name] ?? '执行操作'}…`
        : `正在执行 ${running.length} 个操作…`
    }
    default:
      return null
  }
}

export const TOOL_LABELS: Record<string, string> = {
  list_tasks: '查询任务',
  create_task: '创建任务',
  update_task: '更新任务',
  delete_task: '删除任务',
  // 代码助手（第 29~30 章）
  list_files: '列出文件',
  read_file: '读取文件',
  search: '搜索代码',
  create_file: '新建文件',
  edit_file: '修改文件',
  run_command: '运行命令',
}
