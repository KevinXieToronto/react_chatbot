interface StopBarProps {
  /** 当前阶段的一句话描述，例如"正在读取文件…" */
  text: string | null
  onStop: () => void
}

/** "正在回答… [停止]" 那一条。第 29 章从 CopilotPanel 里抽出来复用 */
export default function StopBar({ text, onStop }: StopBarProps) {
  return (
    <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-2 dark:border-slate-700">
      <span className="truncate text-xs text-slate-400">{text ?? '正在回答…'}</span>
      <button
        type="button"
        onClick={onStop}
        className="flex shrink-0 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-600 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
      >
        <span className="h-2 w-2 rounded-sm bg-slate-500" />
        停止
      </button>
    </div>
  )
}
