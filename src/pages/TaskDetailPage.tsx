import { Link, useNavigate, useParams } from 'react-router'
import { PRIORITY_META, STATUS_META } from '../types/task'
import { useTask, useUpdateTask, useDeleteTask } from '../api/taskQueries'
import PageLoading from '../components/PageLoading'
import ErrorBanner from '../components/ErrorBanner'

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  // 单独查这一条。好处：直接打开详情页链接也能工作，不依赖列表先加载过。
  const { data: task, isPending, isError, error, refetch } = useTask(id)
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()

  if (isPending) return <PageLoading />

  if (isError) {
    return <ErrorBanner message={error.message} onRetry={() => void refetch()} />
  }

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

  function handleToggle() {
    if (!task) return
    updateTask.mutate({
      id: task.id,
      patch: { status: task.status === 'done' ? 'todo' : 'done' },
    })
  }

  function handleDelete() {
    if (!task) return
    deleteTask.mutate(task.id, {
      // 第二个参数可以给单次调用挂回调
      onSuccess: () => navigate('/', { replace: true }),
    })
  }

  return (
    <article>
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
            onClick={handleToggle}
            disabled={updateTask.isPending}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {task.status === 'done' ? '标记为未完成' : '标记为已完成'}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleteTask.isPending}
            className="rounded-md px-4 py-2 text-sm text-rose-600 hover:bg-rose-50 disabled:opacity-60 dark:hover:bg-rose-950"
          >
            {deleteTask.isPending ? '删除中…' : '删除任务'}
          </button>
        </div>
      </div>
    </article>
  )
}
