import { useDeferredValue, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useAutoScroll } from '../../hooks/useAutoScroll'
import type { ChatMessage } from '../../types/chat'
import MessageBubble from './MessageBubble'

interface MessageListProps {
  /** 第 29 章起由调用方传入，不再直接读 copilotStore —— 这样代码助手也能复用 */
  messages: ChatMessage[]
  onRetry?: (messageId: string) => void
  /** 没有消息时显示的提示 */
  emptyHint?: ReactNode
  /** 渲染在消息流最下面的内容，比如第 30 章的审批卡片 */
  footer?: ReactNode
}

export default function MessageList({ messages, onRetry, emptyHint, footer }: MessageListProps) {
  const [keyword, setKeyword] = useState('')

  /**
   * useDeferredValue 是 useTransition 的"值版本"。
   * 它返回一个"滞后的" keyword —— 输入框用 keyword（立刻更新），
   * 过滤用 deferredKeyword（低优先级，可以被打断）。
   */
  const deferredKeyword = useDeferredValue(keyword)
  const isFiltering = keyword !== deferredKeyword

  const visible = useMemo(() => {
    const kw = deferredKeyword.trim().toLowerCase()
    if (!kw) return messages
    return messages.filter((m) => m.content.toLowerCase().includes(kw))
  }, [messages, deferredKeyword])

  const last = messages.at(-1)
  // 工具调用的数量和状态也算"内容变化"：工具卡片出现时同样要滚到底
  const toolSig = last?.toolCalls?.map((t) => t.status).join(',') ?? ''
  // footer 出现 / 消失（比如审批卡片弹出来）也要滚到底，不然用户看不到
  const scrollDep = `${messages.length}:${last?.content.length ?? 0}:${last?.status}:${toolSig}:${footer ? 1 : 0}`

  const { containerRef, hasNew, scrollToBottom } = useAutoScroll<HTMLDivElement>({
    dep: scrollDep,
    // 搜索时关掉自动滚动，否则用户看搜索结果会被拽到底部
    enabled: !deferredKeyword.trim(),
  })

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      {/* 消息多了才显示搜索框 */}
      {messages.length > 6 && (
        <div className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索对话…"
            className="w-full rounded border border-slate-200 px-2 py-1 text-xs outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
          />
        </div>
      )}

      <div
        ref={containerRef}
        className={`flex-1 space-y-3 overflow-y-auto px-4 py-3 transition-opacity ${
          isFiltering ? 'opacity-60' : ''
        }`}
      >
        {messages.length === 0 ? (
          <div className="pt-10 text-center text-sm text-slate-400">
            {emptyHint ?? (
              <>
                <p>还没有对话</p>
                <p className="mt-1 text-xs">试试："我还有哪些任务没做完？"</p>
              </>
            )}
          </div>
        ) : visible.length === 0 ? (
          <p className="pt-10 text-center text-sm text-slate-400">没有匹配的消息</p>
        ) : (
          visible.map((m) => <MessageBubble key={m.id} message={m} onRetry={onRetry} />)
        )}
        {footer}
      </div>

      {hasNew && (
        <button
          type="button"
          onClick={() => scrollToBottom('smooth')}
          className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-lg transition hover:bg-blue-700"
        >
          ↓ 有新消息
        </button>
      )}
    </div>
  )
}
