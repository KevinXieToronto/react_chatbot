/** 任务优先级 */
export type Priority = 'low' | 'medium' | 'high'

/** 任务状态 */
export type Status = 'todo' | 'doing' | 'done'

/** 一条任务 */
export interface Task {
  id: string
  title: string
  description: string
  priority: Priority
  status: Status
  /** ISO 8601 字符串，例如 "2026-09-17T08:30:00.000Z" */
  createdAt: string
}

/** 新建任务时的输入：还没有 id 和 createdAt */
export type TaskDraft = Omit<Task, 'id' | 'createdAt'>

/** 优先级对应的中文文案和颜色（Tailwind class） */
export const PRIORITY_META: Record<Priority, { label: string; className: string }> = {
  low: { label: '低', className: 'bg-slate-100 text-slate-600' },
  medium: { label: '中', className: 'bg-amber-100 text-amber-700' },
  high: { label: '高', className: 'bg-rose-100 text-rose-700' },
}

/** 状态对应的中文文案 */
export const STATUS_META: Record<Status, { label: string; className: string }> = {
  todo: { label: '待办', className: 'bg-slate-100 text-slate-600' },
  doing: { label: '进行中', className: 'bg-blue-100 text-blue-700' },
  done: { label: '已完成', className: 'bg-emerald-100 text-emerald-700' },
}
