import { useEffect, useRef, useState } from 'react'
import type { Task } from '../types/task'
import { PRIORITY_META, STATUS_META } from '../types/task'

interface TaskCardProps {
  task: Task
  onToggle: (id: string) => void
  onDelete: (id: string) => void
  onEdit: (id: string) => void
}

export default function TaskCard({ task, onToggle, onDelete, onEdit }: TaskCardProps) {
  const priority = PRIORITY_META[task.priority]
  const status = STATUS_META[task.status]
  const isDone = task.status === 'done'

  // 菜单开关：界面要跟着变 → 用 state
  const [menuOpen, setMenuOpen] = useState(false)
  // 菜单容器的 DOM 节点：只在事件里用来做包含判断 → 用 ref
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // 菜单没开就不用监听，省掉无谓的全局事件
    if (!menuOpen) return

    function handleClickOutside(e: MouseEvent) {
      // e.target 的类型是 EventTarget | null，要断言成 Node 才能给 contains 用
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false)
    }

    // 用 mousedown 而不是 click：click 在 mouseup 后才触发，
    // 如果菜单项自己也绑了 click，顺序会打架
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    // 清理：菜单关闭或组件卸载时移除监听。不写就会不断叠加监听器。
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [menuOpen])

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

            {/* 下拉菜单 */}
            <div ref={menuRef} className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((prev) => !prev)}
                aria-label="更多操作"
                aria-expanded={menuOpen}
                className="rounded px-2 py-0.5 text-sm text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                ⋯
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-full z-10 mt-1 w-24 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
                  <button
                    type="button"
                    onClick={() => {
                      onEdit(task.id)
                      setMenuOpen(false)
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onDelete(task.id)
                      setMenuOpen(false)
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
                  >
                    删除
                  </button>
                </div>
              )}
            </div>
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
