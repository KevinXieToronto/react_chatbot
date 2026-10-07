import { useEffect, useRef, useState } from 'react'
import type { PendingApproval } from '../../types/chat'
import { TOOL_LABELS } from './turnReducer'
import DiffView from '../../components/DiffView'

interface ApprovalCardProps {
  approval: PendingApproval
  onDecide: (decision: 'allow' | 'deny', note: string) => Promise<void>
}

/** 卡片出现后这么久内忽略回车 —— 防止用户发消息时按住的那个回车"顺手"批准了 */
const ENTER_GUARD_MS = 400

/**
 * 审批卡片：模型想执行一个有副作用的工具，停下来问你。
 *
 * 键盘：回车 = 允许，Esc = 拒绝。
 * 例外：光标在"备注"输入框里时，回车 = 带着备注【拒绝】——
 * 会写备注的人多半是想告诉 AI"别这么做"，这时候一个回车绝不能变成批准。
 */
export default function ApprovalCard({ approval, onDecide }: ApprovalCardProps) {
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cardRef = useRef<HTMLDivElement>(null)
  const readyRef = useRef(false)

  // 出现时自动聚焦卡片，键盘操作立刻可用；短暂屏蔽回车
  useEffect(() => {
    cardRef.current?.focus()
    readyRef.current = false
    const timer = setTimeout(() => {
      readyRef.current = true
    }, ENTER_GUARD_MS)
    return () => clearTimeout(timer)
  }, [approval.approvalId])

  async function decide(decision: 'allow' | 'deny') {
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await onDecide(decision, note.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败')
      setSubmitting(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      void decide('deny')
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      const inNote = e.target instanceof HTMLInputElement
      const onCard = e.target === e.currentTarget
      // 焦点在卡片里的其他控件（按钮等）上时，交给控件自己处理：
      // Tab 到"拒绝"再按回车，就该是拒绝，而不是被我们拦下来当成"允许"
      if (!inNote && !onCard) return
      e.preventDefault()
      if (!readyRef.current) return
      void decide(inNote ? 'deny' : 'allow')
    }
  }

  const label = TOOL_LABELS[approval.name] ?? approval.name

  return (
    <div
      ref={cardRef}
      tabIndex={-1}
      role="alertdialog"
      aria-label={`需要你确认：${label}`}
      onKeyDown={handleKeyDown}
      className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm outline-none ring-amber-400 focus:ring-2 dark:border-amber-700 dark:bg-amber-950/40"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-medium text-amber-800 dark:text-amber-200">✋ 需要你确认 · {label}</span>
        <Countdown expiresAt={approval.expiresAt} />
      </div>

      {approval.reason && (
        <p className="mb-2 text-xs text-amber-700 dark:text-amber-300">{approval.reason}</p>
      )}

      {/* 第 31 章：有 diff 就看 diff —— 这正是批准之后会写进磁盘的内容 */}
      {approval.preview ? (
        <>
          <DiffView preview={approval.preview} />
          <details className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            <summary className="cursor-pointer select-none">查看原始参数</summary>
            <div className="mt-1">
              <InputFields input={approval.input} />
            </div>
          </details>
        </>
      ) : (
        <InputFields input={approval.input} />
      )}

      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        disabled={submitting}
        placeholder="备注（可选）：拒绝时告诉 AI 为什么，回车 = 带备注拒绝"
        className="mt-2 w-full rounded border border-amber-200 bg-white px-2 py-1 text-xs outline-none focus:border-amber-400 dark:border-amber-800 dark:bg-slate-800 dark:text-slate-100"
      />

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          disabled={submitting}
          onClick={() => void decide('allow')}
          className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          允许 <kbd className="ml-1 opacity-70">⏎</kbd>
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => void decide('deny')}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
        >
          拒绝 <kbd className="ml-1 opacity-70">Esc</kbd>
        </button>
        {submitting && <span className="text-xs text-slate-400">提交中…</span>}
        {error && <span className="text-xs text-rose-600 dark:text-rose-400">⚠ {error}</span>}
      </div>
    </div>
  )
}

/** 剩余时间倒计时 */
function Countdown({ expiresAt }: { expiresAt: number }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const seconds = Math.max(0, Math.ceil((expiresAt - now) / 1000))
  return (
    <span className={`shrink-0 text-xs ${seconds <= 10 ? 'text-rose-600' : 'text-amber-600 dark:text-amber-400'}`}>
      {seconds} 秒后自动拒绝
    </span>
  )
}

/**
 * 把工具参数"好好地"展示出来。
 * 直接 JSON.stringify 的话，old_str / new_str 里的换行全变成 \n，根本没法看。
 */
function InputFields({ input }: { input: unknown }) {
  if (!input || typeof input !== 'object') {
    return <pre className="rounded bg-white p-2 text-xs dark:bg-slate-800">{JSON.stringify(input)}</pre>
  }

  return (
    <dl className="space-y-1.5">
      {Object.entries(input as Record<string, unknown>).map(([key, value]) => (
        <div key={key}>
          <dt className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{key}</dt>
          <dd>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-white px-2 py-1 font-mono text-xs text-slate-800 dark:bg-slate-800 dark:text-slate-100">
              {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
            </pre>
          </dd>
        </div>
      ))}
    </dl>
  )
}
