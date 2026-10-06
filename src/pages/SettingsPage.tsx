import { useTheme } from '../contexts/ThemeContext'
import { useTaskStore } from '../store/taskStore'
import { useUIStore } from '../store/uiStore'

export default function SettingsPage() {
  const { mode, resolved } = useTheme()
  const tasks = useTaskStore((s) => s.tasks)
  const resetTasks = useTaskStore((s) => s.resetTasks)
  const resetFilters = useUIStore((s) => s.resetFilters)

  function handleExport() {
    // 生成一个 JSON 文件让浏览器下载
    const blob = new Blob([JSON.stringify(tasks, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `taskflow-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url) // 用完释放，否则内存泄漏
  }

  const cardClass =
    'rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800'

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold text-slate-800 dark:text-slate-100">设置</h1>

      <div className={`${cardClass} mb-4`}>
        <h2 className="mb-2 font-medium text-slate-700 dark:text-slate-200">外观</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          当前模式：<b>{mode}</b>，实际生效：<b>{resolved}</b>
        </p>
        <p className="mt-1 text-sm text-slate-400">在右上角切换主题。</p>
      </div>

      <div className={cardClass}>
        <h2 className="mb-3 font-medium text-slate-700 dark:text-slate-200">数据</h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleExport}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            导出为 JSON
          </button>
          <button
            type="button"
            onClick={resetFilters}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            重置筛选条件
          </button>
          <button
            type="button"
            onClick={resetTasks}
            className="rounded-md border border-rose-300 px-3 py-1.5 text-sm text-rose-600 hover:bg-rose-50 dark:border-rose-800 dark:hover:bg-rose-950"
          >
            重置为示例数据
          </button>
        </div>
      </div>
    </>
  )
}
