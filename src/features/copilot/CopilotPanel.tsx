import { useEffect, useState } from 'react'
import { useCopilotStore, useMessages, useActiveConversation } from '../../store/copilotStore'
import { useChat } from './useChat'
import MessageList from './MessageList'
import QuickActions from './QuickActions'
import SessionList from './SessionList'
import UsageBar from './UsageBar'

export default function CopilotPanel() {
  const open = useCopilotStore((s) => s.open)
  const close = useCopilotStore((s) => s.close)
  const busy = useCopilotStore((s) => s.busy)
  const clearChanged = useCopilotStore((s) => s.clearChanged)
  const showSessions = useCopilotStore((s) => s.showSessions)
  const toggleSessions = useCopilotStore((s) => s.toggleSessions)
  const newConversation = useCopilotStore((s) => s.newConversation)

  const conv = useActiveConversation()
  const messages = useMessages()
  // Hook 必须写在提前 return 之前（见第 22 章）
  const { send, stop, retry, phaseText } = useChat()

  const [input, setInput] = useState('')

  // 面板一关：停止生成（第 24 章），清掉看板上的高亮（第 26 章）
  useEffect(() => {
    if (!open) {
      stop()
      clearChanged()
    }
  }, [open, stop, clearChanged])

  if (!open) return null

  function handleSend(e: React.FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text) return
    setInput('')
    void send(text)
  }

  return (
    <aside className="fixed bottom-20 right-4 z-40 flex h-[min(34rem,calc(100vh-8rem))] w-[23rem] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-800">
      <header className="flex items-center justify-between border-b border-slate-200 px-3 py-2.5 dark:border-slate-700">
        <button
          type="button"
          onClick={toggleSessions}
          className="flex min-w-0 items-center gap-1.5 rounded px-1 py-0.5 hover:bg-slate-100 dark:hover:bg-slate-700"
        >
          <span className="text-slate-400">{showSessions ? '✕' : '☰'}</span>
          <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
            {showSessions ? '所有对话' : (conv?.title ?? 'Copilot')}
          </span>
        </button>

        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={() => newConversation()}
            // 正在回答时不能新建（见 store 里的说明），先停止
            disabled={busy}
            title={busy ? '正在回答，先停止再新建' : '新建对话'}
            className="rounded px-2 py-1 text-sm text-slate-400 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-700"
          >
            ＋
          </button>
          <button
            type="button"
            onClick={close}
            aria-label="关闭"
            className="rounded px-2 py-1 text-sm text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            ✕
          </button>
        </div>
      </header>

      {showSessions ? (
        <SessionList />
      ) : (
        <>
          <MessageList onRetry={retry} />

          {messages.length === 0 && (
            <QuickActions onPick={(text) => void send(text)} disabled={busy} />
          )}

          <UsageBar />

          {busy && (
            <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-2 dark:border-slate-700">
              <span className="truncate text-xs text-slate-400">{phaseText ?? '正在回答…'}</span>
              <button
                type="button"
                onClick={stop}
                className="flex shrink-0 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-600 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
              >
                <span className="h-2 w-2 rounded-sm bg-slate-500" />
                停止
              </button>
            </div>
          )}

          <form
            onSubmit={handleSend}
            className="flex gap-2 border-t border-slate-200 p-3 dark:border-slate-700"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={busy ? '正在回答…（可以继续输入）' : '问点什么…'}
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-slate-300"
            >
              发送
            </button>
          </form>
        </>
      )}
    </aside>
  )
}
