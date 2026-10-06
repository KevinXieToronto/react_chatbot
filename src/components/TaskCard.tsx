import { memo, useState } from 'react'
import type { Task } from '../types/task'
import { PRIORITY_META, STATUS_META } from '../types/task'
import { useClickOutside } from '../hooks/useClickOutside'
import { useKeyPress } from '../hooks/useKeyPress'
import { useTaskStore } from '../store/taskStore'
import { useUIStore } from '../store/uiStore'

interface TaskCardProps {
  task: Task
}

const TaskCard = memo(function TaskCard({ task }: TaskCardProps) {
  // 直接从 store 拿 action —— 不再需要父组件层层传 props。
  // action 的引用永远不变，所以这几行不会造成任何多余的重渲染。
  const toggleTask = useTaskStore((s) => s.toggleTask)
  const deleteTask = useTaskStore((s) => s.deleteTask)
  const setEditingId = useUIStore((s) => s.setEditingId)

  const priority = PRIORITY_META[task.priority]
  const status = STATUS_META[task.status]
  const isDone = task.status === 'done'

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useClickOutside<HTMLDivElement>(() => setMenuOpen(false), menuOpen)
  useKeyPress('Escape', () => setMenuOpen(false), { enableInInput: true })

  return (
    <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <input
        type="checkbox"
        checked={isDone}
        onChange={() => toggleTask(task.id)}
        className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-blue-600"
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <h3
            className={
              isDone
                ? 'font-medium text-slate-400 line-through dark:text-slate-500'
                : 'font-medium text-slate-800 dark:text-slate-100'
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

            <div ref={menuRef} className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((prev) => !prev)}
                aria-label="更多操作"
                aria-expanded={menuOpen}
                className="rounded px-2 py-0.5 text-sm text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
              >
                ⋯
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-full z-10 mt-1 w-24 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(task.id)
                      setMenuOpen(false)
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      deleteTask(task.id)
                      setMenuOpen(false)
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950"
                  >
                    删除
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {task.description && (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{task.description}</p>
        )}

        <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
          创建于 {new Date(task.createdAt).toLocaleString('zh-CN')}
        </p>
      </div>
    </div>
  )
})

export default TaskCard
