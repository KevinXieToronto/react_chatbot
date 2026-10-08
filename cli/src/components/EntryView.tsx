import { Box, Text } from 'ink'
import type { Token } from 'marked'
import type { ChatMode } from '@taskflow/agent-core'
import { MarkdownBlock } from '../markdown/Markdown'
import type { Entry } from '../transcript'
import { Header } from './Header'
import { ToolLine } from './ToolLine'

interface BlockViewProps {
  token: Token
  /** 这段文字的第一块：前面画 ⏺ */
  lead: boolean
  width: number
  maxCodeLines?: number
}

/**
 * 回复里的一个 Markdown 块。左边留 2 列：第一块画 ⏺，后面的块对齐缩进。
 *
 * ⚠️ 两个细节缺一不可（见第三节）：
 *   前缀放进 flexShrink={0} 的 Box（<Text> 不接受布局属性）：不然窗口窄的时候 Yoga 会把 "⏺ " 压成 "⏺"
 *   内容给确定的 width：不然里面的文字有时会比终端宽 1~2 列，终端自动折行，Ink 的行数就算错了
 */
export function BlockView({ token, lead, width, maxCodeLines }: BlockViewProps) {
  return (
    <Box marginBottom={1}>
      <Box flexShrink={0}>
        <Text>{lead ? '⏺ ' : '  '}</Text>
      </Box>
      <Box flexDirection="column" width={width - 2}>
        <MarkdownBlock token={token} width={width - 2} maxCodeLines={maxCodeLines} />
      </Box>
    </Box>
  )
}

interface EntryViewProps {
  entry: Entry
  width: number
  apiUrl: string
  /** 标题栏上显示的模式（画标题栏那一刻的模式） */
  mode: ChatMode
}

/** <Static> 里的一条记录 */
export function EntryView({ entry, width, apiUrl, mode }: EntryViewProps) {
  switch (entry.kind) {
    case 'header':
      return <Header apiUrl={apiUrl} mode={mode} />
    case 'user':
      return (
        <Box marginBottom={1}>
          <Box flexShrink={0}>
            <Text color="cyan">❯ </Text>
          </Box>
          <Text>{entry.text}</Text>
        </Box>
      )
    case 'tool':
      return <ToolLine call={entry.call} />
    case 'block':
      return <BlockView token={entry.token} lead={entry.lead} width={width} />
    case 'notice': {
      const color = entry.tone === 'error' ? 'red' : entry.tone === 'warn' ? 'yellow' : undefined
      const text = entry.tone === 'error' ? `✗ ${entry.text}` : entry.tone === 'warn' ? `（${entry.text}）` : entry.text
      return (
        <Box marginBottom={1} paddingLeft={2}>
          <Text color={color}>{text}</Text>
        </Box>
      )
    }
    case 'spacer':
      return <Text> </Text>
  }
}
