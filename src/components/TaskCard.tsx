import type { Task } from '../types/task'
import { PRIORITY_META, STATUS_META } from '../types/task'

interface TaskCardProps {
  task: Task
  onToggle: (id: string) => void
  onDelete: (id: string) => void
  /** 点击编辑，通知父组件进入编辑模式 */
  onEdit: (id: string) => void
}

export default function TaskCard({ task, onToggle, onDelete, onEdit }: TaskCardProps) {
  const priority = PRIORITY_META[task.priority]
  const status = STATUS_META[task.status]
  const isDone = task.status === 'done'

  return (
    <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <input
        type="checkbox"
        checked={isDone}
        onChange={() => onToggle(task.id)}
        className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-blue-600"
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <h3
            className={
              isDone ? 'font-medium text-slate-400 line-through' : 'font-medium text-slate-800'
            }
          >
            {task.title}
          </h3>

          <div className="flex shrink-0 items-center gap-1">
            <span className={`rounded px-2 py-0.5 text-xs ${priority.className}`}>
              {priority.label}
            </span>
            <span className={`rounded px-2 py-0.5 text-xs ${status.className}`}>
              {status.label}
            </span>
            <button
              type="button"
              onClick={() => onEdit(task.id)}
              className="ml-1 rounded px-2 py-0.5 text-xs text-slate-400 hover:bg-blue-50 hover:text-blue-600"
            >
              编辑
            </button>
            <button
              type="button"
              onClick={() => onDelete(task.id)}
              className="rounded px-2 py-0.5 text-xs text-slate-400 hover:bg-rose-50 hover:text-rose-600"
            >
              删除
            </button>
          </div>
        </div>

        {task.description && <p className="mt-2 text-sm text-slate-500">{task.description}</p>}

        <p className="mt-3 text-xs text-slate-400">
          创建于 {new Date(task.createdAt).toLocaleString('zh-CN')}
        </p>
      </div>
    </div>
  )
}
