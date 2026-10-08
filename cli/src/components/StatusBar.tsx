import { Text, useAnimation } from 'ink'
import { describePhase, type TurnState } from '@taskflow/agent-core'

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

interface Props {
  turn: TurnState
  busy: boolean
  count: number
}

export function StatusBar({ turn, busy, count }: Props) {
  // 只有忙的时候才转，空闲时不产生任何重渲染
  const { frame } = useAnimation({ interval: 80, isActive: busy })

  if (!busy) {
    return <Text dimColor>就绪 · {count} 条消息 · Enter 发送 · Ctrl+C 退出</Text>
  }

  return (
    <Text>
      <Text color="yellow">{SPINNER[frame % SPINNER.length]} </Text>
      <Text>{describePhase(turn) ?? '正在输出…'}</Text>
      <Text dimColor> · Esc / Ctrl+C 中止</Text>
    </Text>
  )
}
