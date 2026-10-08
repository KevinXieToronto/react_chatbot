import { Text, useAnimation } from 'ink'
import {
  cacheHitRate,
  describePhase,
  estimateCost,
  type ChatMode,
  type ContextReport,
  type TurnState,
  type UsageTotals,
} from '@taskflow/agent-core'

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

interface Props {
  /** 当前模式（第 38 章）：标题栏只画一次，模式要一直看得见，就放在这里 */
  mode: ChatMode
  turn: TurnState
  busy: boolean
  count: number
  /** 最近一次的上下文情况（第 33 章），还没有就是 null */
  context: ContextReport | null
  /** 整个会话累计的用量 */
  usage: UsageTotals | null
  /** 上一轮的用量：缓存命中率看的是"最近这一轮"，不是累计 */
  lastUsage: UsageTotals | null
}

const n = (x: number) => x.toLocaleString('en-US')

/** 第 33 章网页端上下文条的终端版：挤成一行，Mock 模式下是估算值（≈） */
function stats({ context, usage, lastUsage }: Pick<Props, 'context' | 'usage' | 'lastUsage'>): string[] {
  const parts: string[] = []
  if (context) parts.push(`上下文 ${context.exact ? '' : '≈'}${n(context.tokens)} / ${n(context.budget)}`)
  if (lastUsage) parts.push(`缓存命中 ${Math.round(cacheHitRate(lastUsage) * 100)}%`)
  if (usage) parts.push(`$${estimateCost(usage).toFixed(4)}`)
  return parts
}

export function StatusBar({ mode, turn, busy, count, context, usage, lastUsage }: Props) {
  // 只有忙的时候才转，空闲时不产生任何重渲染
  const { frame } = useAnimation({ interval: 80, isActive: busy })
  const info = stats({ context, usage, lastUsage })

  // 一行放不下时从右边截断：最不重要的快捷键提示先被截掉
  if (!busy) {
    return (
      <Text wrap="truncate-end">
        <Text color="cyan">[{mode}] </Text>
        <Text dimColor>{['就绪', `${count} 条消息`, ...info, '/help 查看命令 · Ctrl+C 退出'].join(' · ')}</Text>
      </Text>
    )
  }

  return (
    <Text wrap="truncate-end">
      <Text color="cyan">[{mode}] </Text>
      <Text color="yellow">{SPINNER[frame % SPINNER.length]} </Text>
      <Text>{describePhase(turn) ?? '正在输出…'}</Text>
      <Text dimColor>{[...info.map((s) => ` · ${s}`), ' · Esc / Ctrl+C 中止'].join('')}</Text>
    </Text>
  )
}
