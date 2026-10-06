import { memo } from 'react'
import { useTasks } from '../api/taskQueries'

const TaskStats = memo(function TaskStats() {
  // 和 BoardPage 调同一个 useTasks()：queryKey 相同，只会发一个请求。
  const { data: tasks = [] } = useTasks()

  const total = tasks.length
  const done = tasks.filter((t) => t.status === 'done').length
  const doing = tasks.filter((t) => t.status === 'doing').length
  const highPriority = tasks.filter((t) => t.priority === 'high' && t.status !== 'done').length

  if (total === 0) return null

  return (
    <div className="mb-4 flex flex-wrap gap-4 text-sm text-slate-500 dark:text-slate-400">
      <span>
        共 <b className="text-slate-700 dark:text-slate-200">{total}</b> 个
      </span>
      <span>
        进行中 <b className="text-blue-600 dark:text-blue-400">{doing}</b>
      </span>
      <span>
        已完成 <b className="text-emerald-600 dark:text-emerald-400">{done}</b>
      </span>
      {highPriority > 0 && (
        <span className="text-rose-600 dark:text-rose-400">
          ⚠ {highPriority} 个高优先级未完成
        </span>
      )}
    </div>
  )
})

export default TaskStats
