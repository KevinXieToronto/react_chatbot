import { useCodeStore } from '../../store/codeStore'
import type { ChatSession } from '../../types/chat'
import { useChat } from '../copilot/useChat'
import MessageList from '../copilot/MessageList'
import ChatComposer from '../copilot/ChatComposer'
import StopBar from '../copilot/StopBar'
import { useFileSync } from './useFileSync'

const SUGGESTIONS = ['列出文件', '看看 src/math.js', '帮我修复 bug', '新建文件 src/clamp.js', '读一下 ../server/.env']

/** 在回调里现取消息，不经过渲染闭包（见 useChat 的 send）。定义在组件外，引用稳定 */
const getCodeMessages = () => useCodeStore.getState().messages

/** 左半边：和代码助手对话。流式、中止、工具状态全部复用 Copilot 的那一套 */
export default function CodeChat() {
  const messages = useCodeStore((s) => s.messages)
  const busy = useCodeStore((s) => s.busy)
  const clearMessages = useCodeStore((s) => s.clearMessages)

  const session: ChatSession = {
    messages,
    getMessages: getCodeMessages,
    addMessage: useCodeStore((s) => s.addMessage),
    patchMessage: useCodeStore((s) => s.patchMessage),
    truncateFrom: useCodeStore((s) => s.truncateFrom),
    setBusy: useCodeStore((s) => s.setBusy),
  }

  const syncFiles = useFileSync()
  const { send, stop, retry, phaseText } = useChat(session, { mode: 'code', onInvalidate: syncFiles })

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
      <header className="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-slate-700">
        <h2 className="text-sm font-medium text-slate-700 dark:text-slate-200">对话</h2>
        <button
          type="button"
          disabled={busy || messages.length === 0}
          onClick={clearMessages}
          className="rounded px-2 py-0.5 text-xs text-slate-400 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-700"
        >
          清空
        </button>
      </header>

      <MessageList
        messages={messages}
        onRetry={retry}
        emptyHint={
          <>
            <p>让 Agent 读代码、找 bug、改文件</p>
            <p className="mt-1 text-xs">它只能访问项目根目录下的 workspace/</p>
          </>
        }
      />

      {messages.length === 0 && (
        <div className="flex flex-wrap gap-1 border-t border-slate-100 px-3 py-2 dark:border-slate-700">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => void send(s)}
              className="rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-500 hover:border-blue-400 hover:text-blue-600 dark:border-slate-600 dark:text-slate-400"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {busy && <StopBar text={phaseText} onStop={stop} />}

      <ChatComposer busy={busy} onSend={(text) => void send(text)} placeholder="比如：帮我修复 bug" />
    </section>
  )
}
