import { useQueryClient } from '@tanstack/react-query'
import { fileKeys } from '../../api/queryKeys'
import { useCodeStore } from '../../store/codeStore'
import FileTree from './FileTree'
import FileViewer from './FileViewer'

/** 右半边：文件树 + 只读查看器 */
export default function FilePanel() {
  const selectedPath = useCodeStore((s) => s.selectedPath)
  const queryClient = useQueryClient()

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-slate-700">
        <h2 className="text-sm font-medium text-slate-700 dark:text-slate-200">workspace/</h2>
        <button
          type="button"
          onClick={() => void queryClient.invalidateQueries({ queryKey: fileKeys.all })}
          className="rounded px-2 py-0.5 text-xs text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
        >
          ⟳ 刷新
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className="w-44 shrink-0 overflow-y-auto border-r border-slate-200 dark:border-slate-700">
          <FileTree />
        </nav>
        <div className="min-w-0 flex-1">
          <FileViewer path={selectedPath} />
        </div>
      </div>
    </section>
  )
}
