import { useQueryClient } from '@tanstack/react-query'
import { fileKeys } from '../../api/queryKeys'
import { useCodeStore, type PanelTab } from '../../store/codeStore'
import FileTree from './FileTree'
import FileViewer from './FileViewer'
import ChangesList from './ChangesList'
import TerminalPanel from './TerminalPanel'
import { useSessionChanges } from './useSessionChanges'

/** 右半边：文件树 + 只读查看器；第 31 章加了"变更"，第 32 章加了"终端" */
export default function FilePanel() {
  const selectedPath = useCodeStore((s) => s.selectedPath)
  const selectFile = useCodeStore((s) => s.selectFile)
  // 第 32 章：标签从组件自己的 state 挪进了 store，命令输出来了要能从外面切过来
  const tab = useCodeStore((s) => s.panelTab)
  const setTab = useCodeStore((s) => s.setPanelTab)
  // 有命令在跑时，"终端"标签上亮一个小点
  const commandRunning = useCodeStore((s) =>
    s.messages.some((m) => m.toolCalls?.some((t) => t.name === 'run_command' && t.status === 'running')),
  )
  const changeCount = useSessionChanges().length
  const queryClient = useQueryClient()

  const tabCls = (t: PanelTab) =>
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
          <button type="button" role="tab" aria-selected={tab === 'terminal'} onClick={() => setTab('terminal')} className={tabCls('terminal')}>
            终端
            {commandRunning && (
              <span className="ml-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500 align-middle">
                <span className="sr-only">（有命令在运行）</span>
              </span>
            )}
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

      {tab === 'files' && (
        <div className="flex min-h-0 flex-1">
          <nav className="w-44 shrink-0 overflow-y-auto border-r border-slate-200 dark:border-slate-700">
            <FileTree />
          </nav>
          <div className="min-w-0 flex-1">
            <FileViewer path={selectedPath} />
          </div>
        </div>
      )}

      {tab === 'changes' && (
        <div className="flex min-h-0 flex-1 flex-col">
          <ChangesList
            onOpenFile={(path) => {
              selectFile(path)
              setTab('files')
            }}
          />
        </div>
      )}

      {tab === 'terminal' && (
        <div className="flex min-h-0 flex-1 flex-col">
          <TerminalPanel />
        </div>
      )}
    </section>
  )
}
