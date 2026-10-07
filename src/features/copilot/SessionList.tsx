import { useCopilotStore } from '../../store/copilotStore'

export default function SessionList() {
  const conversations = useCopilotStore((s) => s.conversations)
  const activeId = useCopilotStore((s) => s.activeId)
  const busy = useCopilotStore((s) => s.busy)
  const select = useCopilotStore((s) => s.selectConversation)
  const remove = useCopilotStore((s) => s.deleteConversation)
  const create = useCopilotStore((s) => s.newConversation)

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* 正在回答时不能切换会话（store 里也拦了，这里让用户看得出来） */}
      {busy && (
        <p className="mx-3 mt-3 rounded bg-amber-50 px-2 py-1 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          正在回答中，先点"停止"才能切换或新建对话
        </p>
      )}

      <button
        type="button"
        onClick={() => create()}
        disabled={busy}
        className="m-3 rounded-lg border border-dashed border-slate-300 py-2 text-sm text-slate-500 hover:border-blue-400 hover:text-blue-600 disabled:opacity-50 dark:border-slate-600 dark:text-slate-400"
      >
        + 新建对话
      </button>

      <ul className="flex-1 space-y-1 overflow-y-auto px-2 pb-2">
        {conversations.map((c) => (
          <li key={c.id}>
            <div
              className={`group flex items-center gap-2 rounded-lg px-2 py-2 text-sm ${
                c.id === activeId
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200'
                  : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              <button
                type="button"
                onClick={() => select(c.id)}
                disabled={busy}
                className="min-w-0 flex-1 truncate text-left disabled:cursor-not-allowed"
                title={c.title}
              >
                {c.title}
                <span className="ml-2 text-xs text-slate-400">{c.messages.length}</span>
              </button>

              <button
                type="button"
                onClick={() => remove(c.id)}
                disabled={busy}
                aria-label="删除对话"
                className="shrink-0 rounded px-1 text-xs text-slate-400 opacity-0 hover:text-rose-600 group-hover:opacity-100 disabled:hidden"
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
