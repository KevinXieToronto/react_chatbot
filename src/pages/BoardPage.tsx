import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import TaskList from '../components/TaskList'
import TaskForm from '../components/TaskForm'
import SearchBar from '../components/SearchBar'
import FilterBar from '../components/FilterBar'
import TaskStats from '../components/TaskStats'
import { useDebounce } from '../hooks/useDebounce'
import { useTaskFilters } from '../hooks/useTaskFilters'
import { processTasks } from '../lib/taskUtils'
import { useTaskStore } from '../store/taskStore'
import { useUIStore } from '../store/uiStore'

export default function BoardPage() {
  const tasks = useTaskStore((s) => s.tasks)
  const addTask = useTaskStore((s) => s.addTask)
  const completeAll = useTaskStore((s) => s.completeAll)
  const clearCompleted = useTaskStore((s) => s.clearCompleted)

  const showForm = useUIStore((s) => s.showForm)
  const toggleForm = useUIStore((s) => s.toggleForm)
  const closeForm = useUIStore((s) => s.closeForm)

  // 筛选和关键词现在的唯一来源是 URL
  const { filters, keyword, setKeyword, isDefault } = useTaskFilters()

  // 输入框需要即时响应（否则打字会卡），所以本地再存一份"正在输入的值"。
  // 注意这不是"两份数据源" —— 本地这份是纯粹的输入缓冲，
  // 真正的筛选依据始终是 URL 里那个。
  const [draftKeyword, setDraftKeyword] = useState(keyword)
  const debouncedDraft = useDebounce(draftKeyword, 300)

  // useTransition：把"写 URL + 重新过滤列表"标记为低优先级，
  // 保证用户打字这种高优先级交互永远流畅。
  const [isPending, startTransition] = useTransition()

  // 记住"最近一次已经和 URL 对上账的关键词"，用来区分
  // "我自己刚写进 URL 的"和"外部（后退键、别的链接）改的"
  const syncedKeywordRef = useRef(keyword)

  // 输入框 → URL：停手 300ms 之后才写
  useEffect(() => {
    if (debouncedDraft === syncedKeywordRef.current) return
    syncedKeywordRef.current = debouncedDraft
    startTransition(() => {
      setKeyword(debouncedDraft)
    })
    // setKeyword 每次渲染都是新函数，故意不放进依赖 —— 放了会死循环。
    // 真实项目里应该用 useCallback 包住 setKeyword，或用 latest ref pattern。
    // 下面这行 eslint-disable 注释，脚手架自带的 oxlint 也认（npm run lint 会照着忽略）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedDraft])

  // URL → 输入框：只有"外部"改了 URL 才同步过来。
  // 我们自己刚写进去的那次变化不能回灌 —— 写 URL 是低优先级的 transition，
  // 它落地的时候用户可能已经又敲了新字，这时回灌会把新敲的字覆盖掉。
  useEffect(() => {
    if (keyword === syncedKeywordRef.current) return
    syncedKeywordRef.current = keyword
    setDraftKeyword(keyword)
  }, [keyword])

  const visibleTasks = useMemo(
    () => processTasks(tasks, keyword, filters),
    [tasks, keyword, filters],
  )

  const pendingCount = tasks.filter((t) => t.status !== 'done').length
  const doneCount = tasks.length - pendingCount

  useEffect(() => {
    document.title = pendingCount > 0 ? `(${pendingCount}) TaskFlow` : 'TaskFlow'
    // 离开看板页时恢复标题，否则其他页面也会显示未完成数
    return () => {
      document.title = 'TaskFlow'
    }
  }, [pendingCount])

  const ghostButton =
    'rounded-md px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800'

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">我的任务</h1>
        <div className="flex flex-wrap gap-2">
          {pendingCount > 0 && (
            <button type="button" onClick={completeAll} className={ghostButton}>
              全部完成
            </button>
          )}
          {doneCount > 0 && (
            <button type="button" onClick={clearCompleted} className={ghostButton}>
              清除已完成
            </button>
          )}
          <button
            type="button"
            onClick={toggleForm}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            {showForm ? '收起' : '+ 新建任务'}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="mb-4">
          <TaskForm
            onSubmit={(draft) => {
              addTask(draft)
              closeForm()
            }}
            onCancel={closeForm}
          />
        </div>
      )}

      <SearchBar
        value={draftKeyword}
        onChange={setDraftKeyword}
        pending={draftKeyword !== keyword || isPending}
      />
      <FilterBar />
      <TaskStats />

      {!isDefault && (
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
          显示 <b className="text-slate-700 dark:text-slate-200">{visibleTasks.length}</b> /{' '}
          {tasks.length} 条
        </p>
      )}

      {/* isPending 时给列表加个半透明，提示"正在更新" */}
      <div className={isPending ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
        <TaskList tasks={visibleTasks} />
      </div>
    </>
  )
}
