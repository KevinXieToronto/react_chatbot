import { lazy, Suspense, useMemo } from 'react'
import { useCodeStore } from '../../store/codeStore'
import type { ToolCall } from '../../types/chat'

// xterm.js 压缩后也有 300 多 KB，同样等第一次点开"终端"标签再下载。
// 输出早就存在 terminalBuffer 里了，终端加载完会整段重放，什么都不会丢
const XTerminal = lazy(() => import('./XTerminal'))

const STATUS: Record<ToolCall['status'], string> = {
  running: '⏳ 运行中',
  awaiting: '✋ 等待确认',
  success: '✅',
  error: '❌',
}

function commandOf(input: unknown): string {
  const command = (input as { command?: unknown } | null)?.command
  return typeof command === 'string' ? command : '（未知命令）'
}

/**
 * "终端"标签：选一条 run_command，看它的输出。
 *
 * 命令列表不存额外的状态，直接从消息里的 toolCalls 派生（和第 31 章的"变更"标签一样）。
 */
export default function TerminalPanel() {
  const messages = useCodeStore((s) => s.messages)
  const terminalId = useCodeStore((s) => s.terminalId)
  const showTerminal = useCodeStore((s) => s.showTerminal)

  const commands = useMemo(
    () => messages.flatMap((m) => m.toolCalls ?? []).filter((t) => t.name === 'run_command'),
    [messages],
  )

  // 没手动选过就显示最近的一条
  const selectedId = terminalId ?? commands.at(-1)?.id ?? null
  const selected = commands.find((c) => c.id === selectedId)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-1.5 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
        {commands.length === 0 ? (
          <span>还没有运行过命令</span>
        ) : (
          <label className="flex min-w-0 items-center gap-1">
            <span className="shrink-0">命令</span>
            <select
              value={selectedId ?? ''}
              onChange={(e) => showTerminal(e.target.value)}
              className="min-w-0 rounded border border-slate-200 bg-white px-1 py-0.5 font-mono text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
            >
              {commands.map((c, i) => (
                <option key={c.id} value={c.id}>
                  #{i + 1} {commandOf(c.input)}
                </option>
              ))}
            </select>
          </label>
        )}
        {selected && (
          <span className="ml-auto shrink-0">
            {STATUS[selected.status]} {selected.summary}
          </span>
        )}
      </div>

      {/* xterm 自己处理滚动，外层不要再 overflow-auto，不然会出现两条滚动条 */}
      <div className="min-h-0 flex-1 bg-slate-50 p-2 dark:bg-slate-900">
        <Suspense fallback={<p className="text-xs text-slate-400">正在加载终端…</p>}>
          <XTerminal toolUseId={selectedId} />
        </Suspense>
      </div>
    </div>
  )
}
