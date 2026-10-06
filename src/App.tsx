import { useEffect, useMemo } from 'react'
import Header from './components/Header'
import PageContainer from './components/PageContainer'
import TaskList from './components/TaskList'
import TaskStats from './components/TaskStats'
import TaskForm from './components/TaskForm'
import SearchBar from './components/SearchBar'
import FilterBar from './components/FilterBar'
import { useDebounce } from './hooks/useDebounce'
import { processTasks } from './lib/taskUtils'
import { useTaskStore } from './store/taskStore'
import { useUIStore } from './store/uiStore'
import { DEFAULT_FILTERS } from './types/filter'

export default function App() {
  // 每个 selector 单独一行，只订阅需要的那一块
  const tasks = useTaskStore((s) => s.tasks)
  const addTask = useTaskStore((s) => s.addTask)
  const completeAll = useTaskStore((s) => s.completeAll)
  const clearCompleted = useTaskStore((s) => s.clearCompleted)
  const resetTasks = useTaskStore((s) => s.resetTasks)

  const keyword = useUIStore((s) => s.keyword)
  const setKeyword = useUIStore((s) => s.setKeyword)
  const filters = useUIStore((s) => s.filters)
  const showForm = useUIStore((s) => s.showForm)
  const toggleForm = useUIStore((s) => s.toggleForm)
  const closeForm = useUIStore((s) => s.closeForm)

  const debouncedKeyword = useDebounce(keyword, 300)
  const isSearchPending = keyword !== debouncedKeyword

  const visibleTasks = useMemo(
    () => processTasks(tasks, debouncedKeyword, filters),
    [tasks, debouncedKeyword, filters],
  )

  const pendingCount = tasks.filter((t) => t.status !== 'done').length
  const doneCount = tasks.length - pendingCount

  useEffect(() => {
    document.title = pendingCount > 0 ? `(${pendingCount}) TaskFlow` : 'TaskFlow'
    return () => {
      document.title = 'TaskFlow'
    }
  }, [pendingCount])

  const isFiltering = debouncedKeyword.trim() !== '' || filters !== DEFAULT_FILTERS

  const ghostButton =
    'rounded-md px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800'

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-900">
      <Header taskCount={tasks.length} />
      <PageContainer>
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
            <button type="button" onClick={resetTasks} className={ghostButton}>
              重置数据
            </button>
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

        <SearchBar value={keyword} onChange={setKeyword} pending={isSearchPending} />
        <FilterBar />
        <TaskStats />

        {isFiltering && (
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
            显示 <b className="text-slate-700 dark:text-slate-200">{visibleTasks.length}</b> /{' '}
            {tasks.length} 条
          </p>
        )}

        <TaskList tasks={visibleTasks} />
      </PageContainer>
    </div>
  )
}
