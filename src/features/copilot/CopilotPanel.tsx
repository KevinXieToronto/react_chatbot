import { useEffect, useState } from 'react'
import { useCopilotStore } from '../../store/copilotStore'
import { useChat } from './useChat'
import MessageList from './MessageList'

export default function CopilotPanel() {
  const open = useCopilotStore((s) => s.open)
  const close = useCopilotStore((s) => s.close)
  const hasMessages = useCopilotStore((s) => s.messages.length > 0)
  const busy = useCopilotStore((s) => s.busy)
  const clear = useCopilotStore((s) => s.clear)

  const [input, setInput] = useState('')

  // Hook 必须写在提前 return 之前（见第 22 章）
  const { send, stop } = useChat()

  // 面板一关就停止生成。
  // 关面板有两个入口：面板里的 ✕，和右下角的悬浮按钮（CopilotButton 里调的是 toggle）。
  // 与其在每个入口都记得调 stop()，不如直接"跟着 open 走"：open 变成 false 就停。
  // 注意面板关着时组件并没有卸载（只是 return null），所以 useChat 里"卸载时 abort"的那个 effect 管不到这里。
  useEffect(() => {
    if (!open) stop()
  }, [open, stop])

  if (!open) return null

  function handleSend(e: React.FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text) return
    setInput('')
    void send(text)
  }

  return (
    <aside className="fixed bottom-20 right-4 z-40 flex h-[min(32rem,calc(100vh-8rem))] w-[22rem] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-800">
      {/* 头部 */}
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <div>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            TaskFlow Copilot
          </p>
          <p className="text-xs text-slate-400">问我关于任务的任何事</p>
        </div>
        <div className="flex gap-1">
          {hasMessages && (
            <button
              type="button"
              onClick={clear}
              title="清空对话"
              className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              清空
            </button>
          )}
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

      <MessageList />

      {/* 正在输出时，输入框上方浮出"停止生成" */}
      {busy && (
        <div className="flex justify-center border-t border-slate-100 py-2 dark:border-slate-700">
          <button
            type="button"
            onClick={stop}
            className="flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-600 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
          >
            <span className="h-2 w-2 rounded-sm bg-slate-500" />
            停止生成
          </button>
        </div>
      )}

      {/* 输入区 */}
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
    </aside>
  )
}
