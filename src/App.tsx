import { useState } from 'react'
import Header from './components/Header'
import PageContainer from './components/PageContainer'
import TaskList from './components/TaskList'
import TaskStats from './components/TaskStats'
import TaskForm from './components/TaskForm'
import { mockTasks } from './data/mockTasks'
import type { Task, TaskDraft } from './types/task'

export default function App() {
  const [tasks, setTasks] = useState<Task[]>(mockTasks)
  const [showForm, setShowForm] = useState(false)

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

  /** 更新一条：保留 id 和 createdAt，其余用草稿覆盖 */
  function handleUpdate(id: string, draft: TaskDraft) {
    setTasks((prev) => prev.map((task) => (task.id === id ? { ...task, ...draft } : task)))
  }

  return (
    <div className="min-h-full bg-slate-50">
      <Header taskCount={tasks.length} />
      <PageContainer>
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-800">我的任务</h1>
          <button
            type="button"
            onClick={() => setShowForm((prev) => !prev)}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            {showForm ? '收起' : '+ 新建任务'}
          </button>
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
