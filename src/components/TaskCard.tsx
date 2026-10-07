import { memo, useState } from 'react'
import { Link } from 'react-router'
import type { Task } from '../types/task'
import { PRIORITY_META, STATUS_META } from '../types/task'
import { useClickOutside } from '../hooks/useClickOutside'
import { useKeyPress } from '../hooks/useKeyPress'
import { useDeleteTask, useUpdateTask } from '../api/taskQueries'
import { useUIStore } from '../store/uiStore'
import { useCopilotStore } from '../store/copilotStore'

interface TaskCardProps {
  task: Task
}

const TaskCard = memo(function TaskCard({ task }: TaskCardProps) {
  // 直接在卡片里使用 mutation —— 不再需要父组件层层传 props。
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()
  const setEditingId = useUIStore((s) => s.setEditingId)

  // 被 Agent 改过的任务加一圈高亮，让用户知道"这条刚变了"
  const isChanged = useCopilotStore((s) => s.changedTaskIds.includes(task.id))

  const priority = PRIORITY_META[task.priority]
  const status = STATUS_META[task.status]
  const isDone = task.status === 'done'

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useClickOutside<HTMLDivElement>(() => setMenuOpen(false), menuOpen)
  useKeyPress('Escape', () => setMenuOpen(false), { enableInInput: true })

  return (
    <div
      className={`flex items-start gap-3 rounded-lg border bg-white p-4 shadow-sm transition-all duration-500 dark:bg-slate-800 ${
        isChanged
          ? 'border-blue-400 ring-2 ring-blue-200 dark:border-blue-500 dark:ring-blue-900'
          : 'border-slate-200 dark:border-slate-700'
      }`}
    >
      <input
        type="checkbox"
        checked={isDone}
        onChange={() =>
          updateTask.mutate({
            id: task.id,
            patch: { status: task.status === 'done' ? 'todo' : 'done' },
          })
        }
        className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-blue-600"
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0">
            <Link
              to={`/tasks/${task.id}`}
              className={
                isDone
                  ? 'font-medium text-slate-400 line-through hover:underline dark:text-slate-500'
                  : 'font-medium text-slate-800 hover:text-blue-600 hover:underline dark:text-slate-100 dark:hover:text-blue-400'
              }
            >
              {task.title}
            </Link>
          </h3>

          <div className="flex shrink-0 items-center gap-1">
            {isChanged && (
              <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700 dark:bg-blue-900 dark:text-blue-200">
                Copilot 刚改过
              </span>
            )}
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
                      deleteTask.mutate(task.id)
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
