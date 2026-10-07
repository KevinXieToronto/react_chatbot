import { memo } from 'react'
import type { Task } from '../types/task'
import TaskCard from './TaskCard'
import TaskForm from './TaskForm'
import EmptyState from './EmptyState'
import { useUpdateTask } from '../api/taskQueries'
import { useUIStore } from '../store/uiStore'
import { useCopilotStore } from '../store/copilotStore'

interface TaskListProps {
  tasks: Task[]
}

const TaskList = memo(function TaskList({ tasks }: TaskListProps) {
  const editingId = useUIStore((s) => s.editingId)
  const setEditingId = useUIStore((s) => s.setEditingId)
  const updateTask = useUpdateTask()
  // 最近被 Copilot 改过的任务
  const changedIds = useCopilotStore((s) => s.changedTaskIds)

  if (tasks.length === 0) {
    return <EmptyState title="没有符合条件的任务" description="试试调整筛选条件或新建一个" />
  }

  return (
    <div className="space-y-3">
      {tasks.map((task) =>
        task.id === editingId ? (
          // key 移到最外层的 div 上：它才是 map 直接返回的元素
          <div key={task.id}>
            {changedIds.includes(task.id) && (
              <p className="mb-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                ⚠ Copilot 刚刚改动过这条任务，保存会覆盖它的修改
              </p>
            )}
            <TaskForm
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
          </div>
        ) : (
          <TaskCard key={task.id} task={task} />
        ),
      )}
    </div>
  )
})

export default TaskList
