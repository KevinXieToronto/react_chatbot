import { useEffect, useState } from 'react'
import Header from './components/Header'
import PageContainer from './components/PageContainer'
import TaskList from './components/TaskList'
import TaskStats from './components/TaskStats'
import TaskForm from './components/TaskForm'
import { mockTasks } from './data/mockTasks'
import { loadTasks, saveTasks } from './lib/storage'
import type { Task, TaskDraft } from './types/task'

export default function App() {
  // 惰性初始化：传函数进去，localStorage 只在首次渲染读一次。
  // 写成 useState(loadTasks() ?? mockTasks) 的话，每次渲染都会读一遍磁盘。
  const [tasks, setTasks] = useState<Task[]>(() => loadTasks() ?? mockTasks)
  const [showForm, setShowForm] = useState(false)

  // effect 1：tasks 变了就写回 localStorage。
  // 这是典型的"连接外部系统"，正是 useEffect 该干的事。
  useEffect(() => {
    saveTasks(tasks)
  }, [tasks])

  // effect 2：同步浏览器标签页标题。
  const pendingCount = tasks.filter((t) => t.status !== 'done').length
  useEffect(() => {
    document.title = pendingCount > 0 ? `(${pendingCount}) TaskFlow` : 'TaskFlow'

    // 清理：组件卸载时恢复标题。
    // 在这个 App 里 App 永远不卸载，看起来没必要；但养成"占用了就还回去"的习惯，
    // 等这段逻辑被挪进某个会卸载的页面组件时，你会庆幸自己写了。
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

  /** 清空所有数据，恢复示例任务 */
  function handleReset() {
    setTasks(mockTasks)
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
              onClick={handleReset}
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

        <TaskStats tasks={tasks} />
        <TaskList
          tasks={tasks}
          onToggle={handleToggle}
          onDelete={handleDelete}
          onUpdate={handleUpdate}
        />
      </PageContainer>
    </div>
  )
}
