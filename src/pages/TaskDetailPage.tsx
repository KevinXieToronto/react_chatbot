import { useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import PageLoading from '../components/PageLoading'
import { PRIORITY_META, STATUS_META } from '../types/task'
import { useTaskStore } from '../store/taskStore'

export default function TaskDetailPage() {
  // useParams 的返回值类型是 Record<string, string | undefined>
  const { id } = useParams<{ id: string }>()

  // useNavigate 用于"事件里跳转"，比如删除后回列表
  const navigate = useNavigate()

  const task = useTaskStore((s) => s.tasks.find((t) => t.id === id))
  const toggleTask = useTaskStore((s) => s.toggleTask)
  const deleteTask = useTaskStore((s) => s.deleteTask)
  const isLoading = useTaskStore((s) => s.isLoading)
  const tasks = useTaskStore((s) => s.tasks)
  const fetchTasks = useTaskStore((s) => s.fetchTasks)

  // 直接访问详情页（比如从别人发的链接进来）时 store 里还没数据
  useEffect(() => {
    if (tasks.length === 0) void fetchTasks()
  }, [tasks.length, fetchTasks])

  if (isLoading) return <PageLoading />

  // 任务不存在（id 打错了、或者已被删除）
  if (!task) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-600 dark:bg-slate-800">
        <p className="text-slate-600 dark:text-slate-300">找不到这条任务</p>
        <Link to="/" className="mt-3 inline-block text-sm text-blue-600 hover:underline">
          ← 返回看板
        </Link>
      </div>
    )
  }

  const priority = PRIORITY_META[task.priority]
  const status = STATUS_META[task.status]

  function handleDelete() {
    if (!task) return
    deleteTask(task.id)
    // 删完跳回列表。replace: true 表示替换当前历史记录 ——
    // 这样用户按"后退"不会又回到这个已经不存在的详情页。
    navigate('/', { replace: true })
  }

  return (
    <article>
      {/* navigate(-1) 等价于浏览器后退 */}
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-4 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400"
      >
        ← 返回
      </button>

      <div className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1
            className={
              task.status === 'done'
                ? 'text-2xl font-bold text-slate-400 line-through dark:text-slate-500'
                : 'text-2xl font-bold text-slate-800 dark:text-slate-100'
            }
          >
            {task.title}
          </h1>
          <div className="flex gap-1">
            <span className={`rounded px-2 py-1 text-xs ${priority.className}`}>
              {priority.label}优先级
            </span>
            <span className={`rounded px-2 py-1 text-xs ${status.className}`}>{status.label}</span>
          </div>
        </div>

        <p className="mt-4 whitespace-pre-wrap text-slate-600 dark:text-slate-300">
          {task.description || <span className="text-slate-400">（没有描述）</span>}
        </p>

        <dl className="mt-6 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-sm dark:border-slate-700">
          <div>
            <dt className="text-slate-400">创建时间</dt>
            <dd className="text-slate-700 dark:text-slate-200">
              {new Date(task.createdAt).toLocaleString('zh-CN')}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">任务 ID</dt>
            <dd className="font-mono text-xs text-slate-500">{task.id}</dd>
          </div>
        </dl>

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={() => toggleTask(task.id)}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            {task.status === 'done' ? '标记为未完成' : '标记为已完成'}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="rounded-md px-4 py-2 text-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950"
          >
            删除任务
          </button>
        </div>
      </div>
    </article>
  )
}
