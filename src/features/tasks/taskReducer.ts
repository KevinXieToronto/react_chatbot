import type { Task, TaskDraft } from '../../types/task'

/**
 * 所有可能的任务变更操作。
 * 用字面量联合类型，switch 里 TS 能自动收窄 payload 的类型，
 * 而且漏写一个 case 时（配合 never 检查）会报错。
 */
export type TaskAction =
  | { type: 'add'; task: Task }
  | { type: 'update'; id: string; draft: TaskDraft }
  | { type: 'delete'; id: string }
  | { type: 'toggle'; id: string }
  | { type: 'completeAll' }
  | { type: 'clearCompleted' }
  | { type: 'replaceAll'; tasks: Task[] }

/**
 * 纯函数：不改入参、不做副作用、同样输入给同样输出。
 * 因为是纯函数，第 19 章可以直接给它写单元测试，完全不用渲染组件。
 */
export function taskReducer(state: Task[], action: TaskAction): Task[] {
  switch (action.type) {
    case 'add':
      // 注意：id 和 createdAt 由调用方在 dispatch 之前生成好。
      // reducer 里不能调 crypto.randomUUID() 或 new Date() —— 那是副作用。
      return [action.task, ...state]

    case 'update':
      return state.map((task) =>
        task.id === action.id ? { ...task, ...action.draft } : task,
      )

    case 'delete':
      return state.filter((task) => task.id !== action.id)

    case 'toggle':
      return state.map((task) =>
        task.id === action.id
          ? { ...task, status: task.status === 'done' ? 'todo' : 'done' }
          : task,
      )

    case 'completeAll':
      return state.map((task) => (task.status === 'done' ? task : { ...task, status: 'done' }))
      // 小细节：已经是 done 的直接返回原对象，保持引用不变，memo 能跳过那些卡片

    case 'clearCompleted':
      return state.filter((task) => task.status !== 'done')

    case 'replaceAll':
      return action.tasks

    default: {
      // 穷尽性检查：如果以后给 TaskAction 加了新类型却忘了在这里处理，
      // TS 会在这一行报错 "Type 'xxx' is not assignable to type 'never'"
      const _exhaustive: never = action
      return _exhaustive
    }
  }
}
