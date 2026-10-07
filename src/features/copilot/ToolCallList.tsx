import { memo } from 'react'
import type { ToolCall } from '../../types/chat'
import { TOOL_LABELS } from './turnReducer'

interface ToolCallListProps {
  toolCalls: ToolCall[]
}

const ICONS: Record<ToolCall['status'], string> = {
  running: '⏳',
  awaiting: '✋',
  success: '✅',
  error: '❌',
}

const ToolCallList = memo(function ToolCallList({ toolCalls }: ToolCallListProps) {
  if (toolCalls.length === 0) return null

  return (
    <ul className="mb-2 space-y-1">
      {toolCalls.map((t) => (
        <li
          key={t.id}
          className={`flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${
            t.status === 'error'
              ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300'
              : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-600 dark:bg-slate-700/50 dark:text-slate-300'
          }`}
        >
          <span className={t.status === 'running' || t.status === 'awaiting' ? 'animate-pulse' : ''}>
            {ICONS[t.status]}
          </span>
          <span className="min-w-0 flex-1">
            <b className="font-medium">{TOOL_LABELS[t.name] ?? t.name}</b>
            {t.summary && <span className="ml-1 text-slate-500 dark:text-slate-400">· {t.summary}</span>}
            {t.status === 'running' && <span className="ml-1 text-slate-400">运行中…</span>}
            {t.status === 'awaiting' && (
              <span className="ml-1 text-amber-600 dark:text-amber-400">等待你确认…</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  )
})

export default ToolCallList
