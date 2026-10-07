import { useState } from 'react'
import { chatApi } from '../../api/chatApi'
import { ApiError } from '../../lib/http'
import { useCopilotStore, createMessage } from '../../store/copilotStore'
import { toWire } from '../../types/chat'

export default function CopilotPanel() {
  const open = useCopilotStore((s) => s.open)
  const close = useCopilotStore((s) => s.close)
  const messages = useCopilotStore((s) => s.messages)
  const busy = useCopilotStore((s) => s.busy)
  const addMessage = useCopilotStore((s) => s.addMessage)
  const patchMessage = useCopilotStore((s) => s.patchMessage)
  const setBusy = useCopilotStore((s) => s.setBusy)
  const clear = useCopilotStore((s) => s.clear)

  const [input, setInput] = useState('')

  if (!open) return null

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || busy) return

    const userMessage = createMessage('user', text)
    addMessage(userMessage)
    setInput('')
    setBusy(true)

    // 先插一条空的助手消息占位，第 22 章会往里填流式内容
    const assistantMessage = createMessage('assistant', '', 'streaming')
    addMessage(assistantMessage)

    try {
      // 注意：要把刚加的 user 消息也带上。
      // store 里的 messages 是上一次渲染的快照，不包含刚 add 的那条。
      const wire = toWire([...messages, userMessage])
      const result = await chatApi.send(wire)
      patchMessage(assistantMessage.id, { content: result.text, status: 'complete' })
    } catch (err) {
      patchMessage(assistantMessage.id, {
        status: 'error',
        error: err instanceof ApiError ? err.message : '请求失败',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <aside className="fixed bottom-20 right-4 z-40 flex h-[32rem] w-[22rem] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-800">
      {/* 头部 */}
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <div>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            TaskFlow Copilot
          </p>
          <p className="text-xs text-slate-400">问我关于任务的任何事</p>
        </div>
        <div className="flex gap-1">
          {messages.length > 0 && (
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

      {/* 消息区 */}
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 && (
          <div className="pt-10 text-center text-sm text-slate-400">
            <p>还没有对话</p>
            <p className="mt-1 text-xs">试试："我还有哪些任务没做完？"</p>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={
                m.role === 'user'
                  ? 'max-w-[85%] rounded-2xl rounded-br-sm bg-blue-600 px-3 py-2 text-sm text-white'
                  : 'max-w-[85%] rounded-2xl rounded-bl-sm bg-slate-100 px-3 py-2 text-sm text-slate-700 dark:bg-slate-700 dark:text-slate-100'
              }
            >
              {m.status === 'error' ? (
                <span className="text-rose-600 dark:text-rose-400">⚠ {m.error}</span>
              ) : m.status === 'streaming' && !m.content ? (
                // 三个点的"正在输入"动画
                <span className="flex gap-1 py-1">
                  {[0, 150, 300].map((delay) => (
                    <span
                      key={delay}
                      className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400"
                      style={{ animationDelay: `${delay}ms` }}
                    />
                  ))}
                </span>
              ) : (
                <span className="whitespace-pre-wrap">{m.content}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 输入区 */}
      <form
        onSubmit={handleSend}
        className="flex gap-2 border-t border-slate-200 p-3 dark:border-slate-700"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="问点什么…"
          disabled={busy}
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 disabled:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-slate-300"
        >
          发送
        </button>
      </form>
    </aside>
  )
}
