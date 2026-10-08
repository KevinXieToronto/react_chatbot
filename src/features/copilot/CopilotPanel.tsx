import { useEffect } from 'react'
import { useCopilotStore, useMessages, useActiveConversation } from '../../store/copilotStore'
import type { ChatSession } from '../../types/chat'
import { useChat } from './useChat'
import { useTaskSync } from './useTaskSync'
import MessageList from './MessageList'
import QuickActions from './QuickActions'
import SessionList from './SessionList'
import UsageBar from './UsageBar'
import ContextMeter from './ContextMeter'
import ChatComposer from './ChatComposer'
import StopBar from './StopBar'

/** 在回调里现取当前会话的消息（见第 28 章 retry 的坑）。定义在组件外，引用稳定 */
function getActiveMessages() {
  const { conversations, activeId } = useCopilotStore.getState()
  return conversations.find((c) => c.id === activeId)?.messages ?? []
}

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

  // 把 copilotStore 适配成 useChat 需要的 ChatSession 接口
  const session: ChatSession = {
    messages,
    getMessages: getActiveMessages,
    addMessage: useCopilotStore((s) => s.addMessage),
    patchMessage: useCopilotStore((s) => s.patchMessage),
    truncateFrom: useCopilotStore((s) => s.truncateFrom),
    setBusy: useCopilotStore((s) => s.setBusy),
    addUsage: useCopilotStore((s) => s.addUsage),
  }

  const syncTasks = useTaskSync()
  const { send, stop, retry, phaseText, context, usage } = useChat(session, {
    mode: 'tasks',
    onInvalidate: (evt) => {
      if (evt.resource === 'tasks') syncTasks(evt.op, evt.task)
    },
  })

  // 面板一关：停止生成（第 24 章），清掉看板上的高亮（第 26 章）。
  // 不管面板是怎么关的（✕ 按钮还是导航栏的开关），都在这里统一收尾。
  // Hook 必须写在提前 return 之前（见第 22 章）
  useEffect(() => {
    if (!open) {
      stop()
      clearChanged()
    }
  }, [open, stop, clearChanged])

  if (!open) return null

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
          <MessageList messages={messages} onRetry={retry} />

          {messages.length === 0 && (
            <QuickActions onPick={(text) => void send(text)} disabled={busy} />
          )}

          {/* 第 33 章：这一轮的上下文大小和缓存命中；下面的 UsageBar 是整个会话的累计 */}
          <ContextMeter context={context} usage={usage} />
          <UsageBar />

          {busy && <StopBar text={phaseText} onStop={stop} />}

          <ChatComposer busy={busy} onSend={(text) => void send(text)} />
        </>
      )}
    </aside>
  )
}
