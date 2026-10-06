/** 骨架屏的基础块：一个会呼吸的灰条 */
function Bar({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-slate-200 dark:bg-slate-700 ${className}`} />
}

/** 任务卡片骨架 —— 形状要贴合真实的 TaskCard，否则加载完会跳动 */
export function TaskCardSkeleton() {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      <Bar className="mt-1 h-4 w-4 shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <Bar className="h-4 w-1/2" />
          <div className="flex gap-1">
            <Bar className="h-4 w-8" />
            <Bar className="h-4 w-12" />
          </div>
        </div>
        <Bar className="h-3 w-3/4" />
        <Bar className="h-3 w-24" />
      </div>
    </div>
  )
}

export function TaskListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }, (_, i) => (
        <TaskCardSkeleton key={i} />
      ))}
    </div>
  )
}

export function StatsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
        <Bar className="h-3 w-16" />
        <Bar className="mt-2 h-10 w-24" />
        <Bar className="mt-3 h-2 w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800"
          >
            <Bar className="h-4 w-20" />
            <div className="mt-3 space-y-2">
              <Bar className="h-4 w-full" />
              <Bar className="h-4 w-full" />
              <Bar className="h-4 w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
