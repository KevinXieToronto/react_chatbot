import { memo } from 'react'
import type { Task } from '../types/task'
import TaskCard from './TaskCard'
import TaskForm from './TaskForm'
import EmptyState from './EmptyState'
import { useUpdateTask } from '../api/taskQueries'
import { useUIStore } from '../store/uiStore'

interface TaskListProps {
  tasks: Task[]
}

const TaskList = memo(function TaskList({ tasks }: TaskListProps) {
  const editingId = useUIStore((s) => s.editingId)
  const setEditingId = useUIStore((s) => s.setEditingId)
  const updateTask = useUpdateTask()

  if (tasks.length === 0) {
    return <EmptyState title="没有符合条件的任务" description="试试调整筛选条件或新建一个" />
  }

  return (
    <div className="space-y-3">
      {tasks.map((task) =>
        task.id === editingId ? (
          <TaskForm
            key={task.id}
            initialValue={{
              title: task.title,
              description: task.description,
              priority: task.priority,
              status: task.status,
            }}
            submitText="保存"
            onSubmit={(draft) => {
              updateTask.mutate({ id: task.id, patch: draft })
              setEditingId(null)
            }}
            onCancel={() => setEditingId(null)}
          />
        ) : (
          <TaskCard key={task.id} task={task} />
        ),
      )}
    </div>
  )
})

export default TaskList
