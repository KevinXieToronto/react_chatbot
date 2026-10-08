import { memo } from 'react'
import type { ContextReport, TokenUsage } from '../../api/chatApi'
import { cacheHitRate } from '../../lib/tokenCost'

interface ContextMeterProps {
  /** 最近一次调用模型前的上下文情况 */
  context: ContextReport | null
  /** 上一轮对话结束时的 token 用量 */
  usage: TokenUsage | null
}

const n = (x: number | undefined) => (x ?? 0).toLocaleString()

/**
 * 上下文条（第 33 章）：发给模型的上下文有多大、离预算还有多远、有没有被整理过，
 * 以及上一轮有多少输入是从缓存里读的。
 *
 * Copilot 和代码助手都用它，数据全部由 props 传进来（useChat 返回的 context / usage）。
 */
const ContextMeter = memo(function ContextMeter({ context, usage }: ContextMeterProps) {
  if (!context && !usage) return null

  const pct = context && context.budget > 0 ? Math.min(100, (context.tokens / context.budget) * 100) : 0
  const barColor = pct > 90 ? 'bg-rose-500' : pct > 70 ? 'bg-amber-500' : 'bg-emerald-500'
  const trimmed = context !== null && (context.truncated > 0 || context.dropped > 0)

  const totals = usage && {
    input: usage.input_tokens ?? 0,
    output: usage.output_tokens ?? 0,
    cacheRead: usage.cache_read_input_tokens ?? 0,
    cacheWrite: usage.cache_creation_input_tokens ?? 0,
  }

  return (
    <div className="space-y-0.5 border-t border-slate-100 px-3 py-1.5 text-[11px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
      {context && (
        <div className="flex items-center gap-2">
          <span className="shrink-0">上下文</span>
          <div
            role="meter"
            aria-label="上下文用量"
            aria-valuemin={0}
            aria-valuemax={context.budget}
            aria-valuenow={context.tokens}
            className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
          >
            <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
          </div>
          <span className="shrink-0 tabular-nums">
            {n(context.tokens)} / {n(context.budget)}
          </span>
          <span
            className="shrink-0 rounded bg-slate-100 px-1 dark:bg-slate-700"
            title={
              context.exact
                ? '服务端调 OpenAI 的计数接口（responses.inputTokens.count）按模型的分词器算的'
                : 'Mock 模式：按字符数粗略估算，只看趋势'
            }
          >
            {context.exact ? '精确' : '估算'}
          </span>
        </div>
      )}

      {context && trimmed && (
        <p>
          整理前 {n(context.before)}：
          {context.truncated > 0 && `截断了 ${context.truncated} 个旧工具结果`}
          {context.truncated > 0 && context.dropped > 0 && ' · '}
          {context.dropped > 0 && `移除了 ${context.dropped} 条旧消息${context.summarized ? '（已生成摘要）' : ''}`}
        </p>
      )}

      {/* 不显示"缓存写"：OpenAI 写缓存不额外收费、也不单独报数，服务端发来的一直是 0 */}
      {totals && (
        <p className="tabular-nums">
          上一轮：输入 {n(totals.input)} · 缓存读 {n(totals.cacheRead)} · 输出 {n(totals.output)} · 命中率{' '}
          {Math.round(cacheHitRate(totals) * 100)}%
        </p>
      )}
    </div>
  )
})

export default ContextMeter
