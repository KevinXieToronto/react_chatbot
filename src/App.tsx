import { useCallback, useEffect, useMemo, useState } from 'react'
import Header from './components/Header'
import PageContainer from './components/PageContainer'
import TaskList from './components/TaskList'
import TaskStats from './components/TaskStats'
import TaskForm from './components/TaskForm'
import SearchBar from './components/SearchBar'
import FilterBar from './components/FilterBar'
import { mockTasks } from './data/mockTasks'
import { useLocalStorage } from './hooks/useLocalStorage'
import { useDebounce } from './hooks/useDebounce'
import { processTasks } from './lib/taskUtils'
import { DEFAULT_FILTERS } from './types/filter'
import type { TaskFilters } from './types/filter'
import type { Task, TaskDraft } from './types/task'

export default function App() {
  const [tasks, setTasks] = useLocalStorage<Task[]>('taskflow:tasks', mockTasks)
  const [showForm, setShowForm] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [filters, setFilters] = useState<TaskFilters>(DEFAULT_FILTERS)

  const debouncedKeyword = useDebounce(keyword, 300)
  const isSearchPending = keyword !== debouncedKeyword

  // useMemo 1：缓存筛选排序的结果。
  // 现在数据量小，这个 memo 主要价值是"保持 visibleTasks 引用稳定" ——
  // 否则每次渲染都是新数组，memo 包裹的 TaskList 会白白重渲染。
  const visibleTasks = useMemo(
    () => processTasks(tasks, debouncedKeyword, filters),
    [tasks, debouncedKeyword, filters],
  )

  // useCallback：这三个函数要传给 memo 包裹的 TaskList / TaskCard，
  // 必须保持引用稳定，否则 memo 完全失效。
  // 注意依赖数组都是空的 —— 因为用了函数式更新，不需要读 tasks。
  const handleToggle = useCallback(
    (id: string) => {
      setTasks((prev) =>
        prev.map((task) =>
          task.id === id
            ? { ...task, status: task.status === 'done' ? 'todo' : 'done' }
            : task,
        ),
      )
    },
    [setTasks],
  )

  const handleDelete = useCallback(
    (id: string) => {
      setTasks((prev) => prev.filter((task) => task.id !== id))
    },
    [setTasks],
  )

  const handleUpdate = useCallback(
    (id: string, draft: TaskDraft) => {
      setTasks((prev) => prev.map((task) => (task.id === id ? { ...task, ...draft } : task)))
    },
    [setTasks],
  )

  const handleCreate = useCallback(
    (draft: TaskDraft) => {
      const newTask: Task = {
        ...draft,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      }
      setTasks((prev) => [newTask, ...prev])
      setShowForm(false)
    },
    [setTasks],
  )

  const pendingCount = tasks.filter((t) => t.status !== 'done').length
  useEffect(() => {
    document.title = pendingCount > 0 ? `(${pendingCount}) TaskFlow` : 'TaskFlow'
    return () => {
      document.title = 'TaskFlow'
    }
  }, [pendingCount])

  const isFiltering = debouncedKeyword.trim() !== '' || filters !== DEFAULT_FILTERS

  return (
    <div className="min-h-full bg-slate-50">
      <Header taskCount={tasks.length} />
      <PageContainer>
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-800">我的任务</h1>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTasks(mockTasks)}
              className="rounded-md px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-200"
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
          <p className="mb-3 text-sm text-slate-500">
            显示 <b className="text-slate-700">{visibleTasks.length}</b> / {tasks.length} 条
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
