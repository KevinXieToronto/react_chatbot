import { useCallback, useEffect, useMemo, useState } from 'react'
import Header from './components/Header'
import PageContainer from './components/PageContainer'
import TaskList from './components/TaskList'
import TaskStats from './components/TaskStats'
import TaskForm from './components/TaskForm'
import SearchBar from './components/SearchBar'
import FilterBar from './components/FilterBar'
import { mockTasks } from './data/mockTasks'
import { useDebounce } from './hooks/useDebounce'
import { useTasks } from './features/tasks/useTasks'
import { processTasks } from './lib/taskUtils'
import { DEFAULT_FILTERS } from './types/filter'
import type { TaskFilters } from './types/filter'
import type { Task, TaskDraft } from './types/task'

export default function App() {
  const { tasks, dispatch } = useTasks()

  const [showForm, setShowForm] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [filters, setFilters] = useState<TaskFilters>(DEFAULT_FILTERS)

  const debouncedKeyword = useDebounce(keyword, 300)
  const isSearchPending = keyword !== debouncedKeyword

  const visibleTasks = useMemo(
    () => processTasks(tasks, debouncedKeyword, filters),
    [tasks, debouncedKeyword, filters],
  )

  // dispatch 引用永久稳定，所以这些 useCallback 的依赖是稳定的
  const handleToggle = useCallback((id: string) => dispatch({ type: 'toggle', id }), [dispatch])
  const handleDelete = useCallback((id: string) => dispatch({ type: 'delete', id }), [dispatch])
  const handleUpdate = useCallback(
    (id: string, draft: TaskDraft) => dispatch({ type: 'update', id, draft }),
    [dispatch],
  )

  const handleCreate = useCallback(
    (draft: TaskDraft) => {
      // id 和时间在这里生成 —— 绝不能放进 reducer
      const task: Task = {
        ...draft,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      }
      dispatch({ type: 'add', task })
      setShowForm(false)
    },
    [dispatch],
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

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-900">
      <Header taskCount={tasks.length} />
      <PageContainer>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">我的任务</h1>
          <div className="flex flex-wrap gap-2">
            {pendingCount > 0 && (
              <button
                type="button"
                onClick={() => dispatch({ type: 'completeAll' })}
                className="rounded-md px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                全部完成
              </button>
            )}
            {doneCount > 0 && (
              <button
                type="button"
                onClick={() => dispatch({ type: 'clearCompleted' })}
                className="rounded-md px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                清除已完成
              </button>
            )}
            <button
              type="button"
              onClick={() => dispatch({ type: 'replaceAll', tasks: mockTasks })}
              className="rounded-md px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              重置数据
            </button>
            <button
              type="button"
              onClick={() => setShowForm((prev) => !prev)}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              {showForm ? '收起' : '+ 新建任务'}
            </button>
          </div>
        </div>

        {showForm && (
          <div className="mb-4">
            <TaskForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} />
          </div>
        )}

        <SearchBar value={keyword} onChange={setKeyword} pending={isSearchPending} />
        <FilterBar filters={filters} onChange={setFilters} />
        <TaskStats tasks={tasks} />

        {isFiltering && (
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
            显示 <b className="text-slate-700 dark:text-slate-200">{visibleTasks.length}</b> /{' '}
            {tasks.length} 条
          </p>
        )}

        <TaskList
          tasks={visibleTasks}
          onToggle={handleToggle}
          onDelete={handleDelete}
          onUpdate={handleUpdate}
        />
      </PageContainer>
    </div>
  )
}
