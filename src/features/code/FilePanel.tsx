import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { fileKeys } from '../../api/queryKeys'
import { useCodeStore } from '../../store/codeStore'
import FileTree from './FileTree'
import FileViewer from './FileViewer'
import ChangesList from './ChangesList'
import { useSessionChanges } from './useSessionChanges'

type Tab = 'files' | 'changes'

/** 右半边：文件树 + 只读查看器；第 31 章加了"变更"标签 */
export default function FilePanel() {
  const selectedPath = useCodeStore((s) => s.selectedPath)
  const selectFile = useCodeStore((s) => s.selectFile)
  const changeCount = useSessionChanges().length
  const queryClient = useQueryClient()

  const [tab, setTab] = useState<Tab>('files')

  const tabCls = (t: Tab) =>
    `rounded px-2 py-0.5 text-sm ${
      tab === t
        ? 'bg-slate-100 font-medium text-slate-800 dark:bg-slate-700 dark:text-slate-100'
        : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
    }`

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-slate-700">
        <div className="flex gap-1" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'files'} onClick={() => setTab('files')} className={tabCls('files')}>
            workspace/
          </button>
          <button type="button" role="tab" aria-selected={tab === 'changes'} onClick={() => setTab('changes')} className={tabCls('changes')}>
            变更{changeCount > 0 && <span className="ml-1 text-xs text-amber-600">{changeCount}</span>}
          </button>
        </div>
        <button
          type="button"
          onClick={() => void queryClient.invalidateQueries({ queryKey: fileKeys.all })}
          className="rounded px-2 py-0.5 text-xs text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
        >
          ⟳ 刷新
        </button>
      </header>

      {tab === 'files' ? (
        <div className="flex min-h-0 flex-1">
          <nav className="w-44 shrink-0 overflow-y-auto border-r border-slate-200 dark:border-slate-700">
            <FileTree />
          </nav>
          <div className="min-w-0 flex-1">
            <FileViewer path={selectedPath} />
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <ChangesList
            onOpenFile={(path) => {
              selectFile(path)
              setTab('files')
            }}
          />
        </div>
      )}
    </section>
  )
}
