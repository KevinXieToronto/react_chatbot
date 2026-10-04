import { useState } from 'react'
import type { Task, TaskDraft } from '../types/task'
import TaskCard from './TaskCard'
import TaskForm from './TaskForm'
import EmptyState from './EmptyState'

interface TaskListProps {
  tasks: Task[]
  onToggle: (id: string) => void
  onDelete: (id: string) => void
  /** 保存编辑结果 */
  onUpdate: (id: string, draft: TaskDraft) => void
}

export default function TaskList({ tasks, onToggle, onDelete, onUpdate }: TaskListProps) {
  // 纯 UI 状态：当前正在编辑哪一条。null 表示没有。
  // 放在这里而不是 App，因为只有 TaskList 需要读它。
  const [editingId, setEditingId] = useState<string | null>(null)

  if (tasks.length === 0) {
    return <EmptyState title="还没有任务" description="点击上方按钮新建一个试试" />
  }

  return (
    <div className="space-y-3">
      {tasks.map((task) =>
        task.id === editingId ? (
          <TaskForm
            key={task.id}
            // 把 Task 拆成 TaskDraft（去掉 id 和 createdAt）
            initialValue={{
              title: task.title,
              description: task.description,
              priority: task.priority,
              status: task.status,
            }}
            submitText="保存"
            onSubmit={(draft) => {
              onUpdate(task.id, draft)
              setEditingId(null)
            }}
            onCancel={() => setEditingId(null)}
          />
        ) : (
          <TaskCard
            key={task.id}
            task={task}
            onToggle={onToggle}
            onDelete={onDelete}
            onEdit={setEditingId}
          />
        ),
      )}
    </div>
  )
}
