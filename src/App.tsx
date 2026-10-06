import { useEffect, useState } from 'react'
import Header from './components/Header'
import PageContainer from './components/PageContainer'
import TaskList from './components/TaskList'
import TaskStats from './components/TaskStats'
import TaskForm from './components/TaskForm'
import SearchBar from './components/SearchBar'
import { mockTasks } from './data/mockTasks'
import { useLocalStorage } from './hooks/useLocalStorage'
import { useDebounce } from './hooks/useDebounce'
import type { Task, TaskDraft } from './types/task'

export default function App() {
  // 一行替代了原来的 useState(loadTasks) + useEffect(saveTasks)
  const [tasks, setTasks] = useLocalStorage<Task[]>('taskflow:tasks', mockTasks)

  const [showForm, setShowForm] = useState(false)
  const [keyword, setKeyword] = useState('')

  // 用户停止输入 300ms 后，debouncedKeyword 才更新
  const debouncedKeyword = useDebounce(keyword, 300)
  const isSearchPending = keyword !== debouncedKeyword

  const kw = debouncedKeyword.trim().toLowerCase()
  const visibleTasks = kw
    ? tasks.filter(
        (task) =>
          task.title.toLowerCase().includes(kw) || task.description.toLowerCase().includes(kw),
      )
    : tasks

  const pendingCount = tasks.filter((t) => t.status !== 'done').length
  useEffect(() => {
    document.title = pendingCount > 0 ? `(${pendingCount}) TaskFlow` : 'TaskFlow'
    return () => {
      document.title = 'TaskFlow'
    }
  }, [pendingCount])

  function handleToggle(id: string) {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === id
          ? { ...task, status: task.status === 'done' ? 'todo' : 'done' }
          : task,
      ),
    )
  }

  function handleDelete(id: string) {
    setTasks((prev) => prev.filter((task) => task.id !== id))
  }

  function handleCreate(draft: TaskDraft) {
    const newTask: Task = {
      ...draft,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    }
    setTasks((prev) => [newTask, ...prev])
    setShowForm(false)
  }

  function handleUpdate(id: string, draft: TaskDraft) {
    setTasks((prev) => prev.map((task) => (task.id === id ? { ...task, ...draft } : task)))
  }

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

        {kw && (
          <p className="mb-3 text-sm text-slate-500">
            匹配到 <b className="text-slate-700">{visibleTasks.length}</b> 条
          </p>
        )}

        <TaskStats tasks={tasks} />
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
