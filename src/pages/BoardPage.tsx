import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import TaskList from '../components/TaskList'
import TaskForm from '../components/TaskForm'
import SearchBar from '../components/SearchBar'
import FilterBar from '../components/FilterBar'
import TaskStats from '../components/TaskStats'
import ErrorBanner from '../components/ErrorBanner'
import PageLoading from '../components/PageLoading'
import { useDebounce } from '../hooks/useDebounce'
import { useTaskFilters } from '../hooks/useTaskFilters'
import { processTasks } from '../lib/taskUtils'
import { useTasks, useCreateTask, useBulkUpdate, useBulkDelete } from '../api/taskQueries'
import { useUIStore } from '../store/uiStore'

export default function BoardPage() {
  // 一行代替了第 15 章的 fetchTasks + isLoading + error + useEffect
  const { data: tasks = [], isPending, isFetching, isError, error, refetch } = useTasks()

  const createTask = useCreateTask()
  const bulkUpdate = useBulkUpdate()
  const bulkDelete = useBulkDelete()

  const showForm = useUIStore((s) => s.showForm)
  const toggleForm = useUIStore((s) => s.toggleForm)
  const closeForm = useUIStore((s) => s.closeForm)

  const { filters, keyword, setKeyword, isDefault } = useTaskFilters()

  const [draftKeyword, setDraftKeyword] = useState(keyword)
  const debouncedDraft = useDebounce(draftKeyword, 300)
  const [isTransitioning, startTransition] = useTransition()

  // 和第 14 章一样：用 ref 区分"自己刚写进 URL 的"和"外部改的"，避免回灌覆盖用户新敲的字
  const syncedKeywordRef = useRef(keyword)

  useEffect(() => {
    if (debouncedDraft === syncedKeywordRef.current) return
    syncedKeywordRef.current = debouncedDraft
    startTransition(() => setKeyword(debouncedDraft))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedDraft])

  useEffect(() => {
    if (keyword === syncedKeywordRef.current) return
    syncedKeywordRef.current = keyword
    setDraftKeyword(keyword)
  }, [keyword])

  const visibleTasks = useMemo(
    () => processTasks(tasks, keyword, filters),
    [tasks, keyword, filters],
  )

  const pendingTasks = tasks.filter((t) => t.status !== 'done')
  const doneTasks = tasks.filter((t) => t.status === 'done')

  useEffect(() => {
    document.title = pendingTasks.length > 0 ? `(${pendingTasks.length}) TaskFlow` : 'TaskFlow'
  }, [pendingTasks.length])

  const isMutating = createTask.isPending || bulkUpdate.isPending || bulkDelete.isPending

  const ghostButton =
    'rounded-md px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-200 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800'

  // isPending = 从来没成功过 → 显示骨架屏
  if (isPending) return <PageLoading />

  return (
    <>
      {/* isFetching = 正在后台刷新（有缓存时不显示骨架屏，只显示一个细条） */}
      {isFetching && (
        <div className="fixed left-0 right-0 top-0 h-0.5 animate-pulse bg-blue-500" />
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">我的任务</h1>
        <div className="flex flex-wrap gap-2">
          {pendingTasks.length > 0 && (
            <button
              type="button"
              disabled={isMutating}
              onClick={() =>
                bulkUpdate.mutate({ ids: pendingTasks.map((t) => t.id), patch: { status: 'done' } })
              }
              className={ghostButton}
            >
              全部完成
            </button>
          )}
          {doneTasks.length > 0 && (
            <button
              type="button"
              disabled={isMutating}
              onClick={() => bulkDelete.mutate(doneTasks.map((t) => t.id))}
              className={ghostButton}
            >
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

      {isError && (
        <ErrorBanner message={error.message} onRetry={() => void refetch()} />
      )}

      {showForm && (
        <div className="mb-4">
          <TaskForm
            submitText={createTask.isPending ? '提交中…' : '添加'}
            onSubmit={(draft) => {
              createTask.mutate(draft)
              closeForm()
            }}
            onCancel={closeForm}
          />
        </div>
      )}

      <SearchBar
        value={draftKeyword}
        onChange={setDraftKeyword}
        pending={draftKeyword !== keyword || isTransitioning}
      />
      <FilterBar />
      <TaskStats />

      {!isDefault && (
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
          显示 <b className="text-slate-700 dark:text-slate-200">{visibleTasks.length}</b> /{' '}
          {tasks.length} 条
        </p>
      )}

      <div className={isTransitioning ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
        <TaskList tasks={visibleTasks} />
      </div>
    </>
  )
}
