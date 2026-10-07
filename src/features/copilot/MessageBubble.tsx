import { memo } from 'react'
import type { ChatMessage } from '../../types/chat'

interface MessageBubbleProps {
  message: ChatMessage
}

const MessageBubble = memo(function MessageBubble({ message: m }: MessageBubbleProps) {
  const isUser = m.role === 'user'

  return (
    // msg-item 这个 class 在本章第六节用到（content-visibility 优化）
    <div className={isUser ? 'msg-item flex justify-end' : 'msg-item flex justify-start'}>
      <div
        className={
          isUser
            ? 'max-w-[85%] rounded-2xl rounded-br-sm bg-blue-600 px-3 py-2 text-sm text-white'
            : 'max-w-[85%] rounded-2xl rounded-bl-sm bg-slate-100 px-3 py-2 text-sm text-slate-700 dark:bg-slate-700 dark:text-slate-100'
        }
      >
        {m.status === 'error' ? (
          <span className="text-rose-600 dark:text-rose-400">⚠ {m.error}</span>
        ) : m.status === 'streaming' && !m.content ? (
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
          <span className="whitespace-pre-wrap break-words">
            {m.content}
            {m.status === 'streaming' && (
              <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-slate-400 align-middle" />
            )}
            {m.status === 'aborted' && (
              <span className="ml-1 text-xs text-slate-400">（已停止）</span>
            )}
          </span>
        )}
      </div>
    </div>
  )
})

export default MessageBubble
