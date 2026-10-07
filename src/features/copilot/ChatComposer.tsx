import { useState } from 'react'

interface ChatComposerProps {
  onSend: (text: string) => void
  /** 正在回答时仍然允许输入（第 24 章：新消息会中止旧请求） */
  busy?: boolean
  /** 完全禁用输入 */
  disabled?: boolean
  placeholder?: string
}

/**
 * 聊天输入框。原来写在 CopilotPanel 里，第 29 章抽出来给代码助手复用。
 * 输入内容是这个组件自己的局部状态 —— 父组件不需要知道用户正在打什么字。
 */
export default function ChatComposer({ onSend, busy, disabled, placeholder }: ChatComposerProps) {
  const [input, setInput] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || disabled) return
    setInput('')
    onSend(text)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex gap-2 border-t border-slate-200 p-3 dark:border-slate-700"
    >
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        disabled={disabled}
        placeholder={placeholder ?? (busy ? '正在回答…（可以继续输入）' : '问点什么…')}
        className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:disabled:bg-slate-800"
      />
      <button
        type="submit"
        disabled={disabled || !input.trim()}
        className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-600"
      >
        发送
      </button>
    </form>
  )
}
