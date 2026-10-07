import { memo } from 'react'
import type { ChatMessage } from '../../types/chat'
import ToolCallList from './ToolCallList'
import Markdown from './Markdown'

interface MessageBubbleProps {
  message: ChatMessage
  /** 点"重试"/"重新生成"时调用，参数是这条助手消息的 id */
  onRetry?: (messageId: string) => void
}

const MessageBubble = memo(function MessageBubble({ message: m, onRetry }: MessageBubbleProps) {
  const isUser = m.role === 'user'

  return (
    // msg-item：第 23 章的 content-visibility 优化
    <div className={isUser ? 'msg-item flex justify-end' : 'msg-item flex justify-start'}>
      <div
        className={
          isUser
            ? 'max-w-[85%] rounded-2xl rounded-br-sm bg-blue-600 px-3 py-2 text-sm text-white'
            : 'max-w-[85%] rounded-2xl rounded-bl-sm bg-slate-100 px-3 py-2 text-sm text-slate-700 dark:bg-slate-700 dark:text-slate-100'
        }
      >
        {/* 工具调用显示在文本上方 */}
        {!isUser && m.toolCalls && m.toolCalls.length > 0 && (
          <ToolCallList toolCalls={m.toolCalls} />
        )}

        {m.status === 'error' ? (
          <div className="text-rose-600 dark:text-rose-400">
            <span>⚠ {m.error}</span>
            {/* 只有可重试的错误才显示重试按钮 ——
                API Key 无效时重试一万次也没用，显示按钮只会误导用户 */}
            {m.errorKind !== 'config' && m.errorKind !== 'input' && onRetry && (
              <button
                type="button"
                onClick={() => onRetry(m.id)}
                className="ml-2 rounded border border-rose-300 px-2 py-0.5 text-xs hover:bg-rose-100 dark:border-rose-800 dark:hover:bg-rose-950"
              >
                重试
              </button>
            )}
          </div>
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
        ) : isUser ? (
          // 用户消息不渲染 Markdown —— 用户打的星号就该显示成星号
          <span className="whitespace-pre-wrap break-words">{m.content}</span>
        ) : (
          <div className="break-words">
            <Markdown content={m.content} streaming={m.status === 'streaming'} />
            {m.status === 'streaming' && (
              <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-slate-400 align-middle" />
            )}
            {m.status === 'aborted' && (
              <span className="ml-1 text-xs text-slate-400">（已停止）</span>
            )}
            {/* 中止的消息也给个重新生成 */}
            {m.status === 'aborted' && onRetry && (
              <button
                type="button"
                onClick={() => onRetry(m.id)}
                className="ml-2 rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-700"
              >
                重新生成
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
})

export default MessageBubble
