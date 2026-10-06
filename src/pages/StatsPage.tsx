import { useTasks } from '../api/taskQueries'
import { PRIORITY_META, STATUS_META } from '../types/task'
import type { Priority, Status } from '../types/task'

export default function StatsPage() {
  const { data: tasks = [] } = useTasks()

  const total = tasks.length
  const done = tasks.filter((t) => t.status === 'done').length
  const rate = total === 0 ? 0 : Math.round((done / total) * 100)

  // 按状态和优先级各统计一次
  const byStatus = (Object.keys(STATUS_META) as Status[]).map((s) => ({
    key: s,
    label: STATUS_META[s].label,
    count: tasks.filter((t) => t.status === s).length,
  }))

  const byPriority = (Object.keys(PRIORITY_META) as Priority[]).map((p) => ({
    key: p,
    label: PRIORITY_META[p].label,
    count: tasks.filter((t) => t.priority === p).length,
  }))

  const cardClass = 'rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800'

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold text-slate-800 dark:text-slate-100">统计</h1>

      <div className={`${cardClass} mb-4`}>
        <p className="text-sm text-slate-500 dark:text-slate-400">完成率</p>
        <p className="mt-1 text-4xl font-bold text-slate-800 dark:text-slate-100">{rate}%</p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-300"
            style={{ width: `${rate}%` }}
          />
        </div>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          {done} / {total} 条已完成
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className={cardClass}>
          <h2 className="mb-3 font-medium text-slate-700 dark:text-slate-200">按状态</h2>
          <ul className="space-y-2">
            {byStatus.map((row) => (
              <li key={row.key} className="flex items-center justify-between text-sm">
                <span className={`rounded px-2 py-0.5 text-xs ${STATUS_META[row.key].className}`}>
                  {row.label}
                </span>
                <b className="text-slate-700 dark:text-slate-200">{row.count}</b>
              </li>
            ))}
          </ul>
        </div>

        <div className={cardClass}>
          <h2 className="mb-3 font-medium text-slate-700 dark:text-slate-200">按优先级</h2>
          <ul className="space-y-2">
            {byPriority.map((row) => (
              <li key={row.key} className="flex items-center justify-between text-sm">
                <span className={`rounded px-2 py-0.5 text-xs ${PRIORITY_META[row.key].className}`}>
                  {row.label}
                </span>
                <b className="text-slate-700 dark:text-slate-200">{row.count}</b>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  )
}
