import { useOptimistic, useTransition } from 'react'
import { useTasks, useBulkUpdate } from '../../api/taskQueries'

const SUGGESTIONS = [
  '我还有哪些任务没做完？',
  '帮我加个任务：买咖啡豆',
  '把所有高优先级任务列出来',
]

interface QuickActionsProps {
  onPick: (text: string) => void
  disabled?: boolean
}

export default function QuickActions({ onPick, disabled }: QuickActionsProps) {
  const { data: tasks = [] } = useTasks()
  const bulkUpdate = useBulkUpdate()
  const [isPending, startTransition] = useTransition()

  const pending = tasks.filter((t) => t.status !== 'done')

  /**
   * useOptimistic：点"全部完成"后，数字立刻变成 0，
   * 不用等请求回来。请求结束后自动回到真实值。
   *
   * 注意第二个参数是"怎么把乐观值合并进当前值"的纯函数。
   */
  const [optimisticCount, setOptimisticCount] = useOptimistic(
    pending.length,
    (_current, next: number) => next,
  )

  function handleCompleteAll() {
    if (pending.length === 0) return

    // ⚠️ useOptimistic 的更新必须在 transition 或 action 内部调用，
    //    直接调会报 "An optimistic state update occurred outside a transition"
    startTransition(async () => {
      setOptimisticCount(0)
      try {
        await bulkUpdate.mutateAsync({
          ids: pending.map((t) => t.id),
          patch: { status: 'done' },
        })
      } catch {
        // ⚠️ 必须 catch：React 19 里 transition 函数抛出的错误会被抛给最近的错误边界，
        //    整块界面会变成错误兜底页。失败时这里什么都不用做。
      }
      // 不用手动恢复（成功失败都一样）—— transition 结束后 optimisticCount 自动回到真实值
    })
  }

  return (
    <div className="border-t border-slate-100 px-3 py-2 dark:border-slate-700">
      <div className="mb-1.5 flex flex-wrap gap-1">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={disabled}
            onClick={() => onPick(s)}
            className="rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-500 hover:border-blue-400 hover:text-blue-600 disabled:opacity-50 dark:border-slate-600 dark:text-slate-400"
          >
            {s}
          </button>
        ))}
      </div>

      {optimisticCount > 0 && (
        <button
          type="button"
          onClick={handleCompleteAll}
          disabled={isPending}
          className="text-xs text-slate-400 hover:text-emerald-600 disabled:opacity-50"
        >
          ✓ 一键完成全部 {optimisticCount} 条待办
        </button>
      )}
    </div>
  )
}
