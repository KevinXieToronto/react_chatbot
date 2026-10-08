import { Box, Text } from 'ink'
import type { ChatMode } from '@taskflow/agent-core'

/** 每种模式在 Mock 下能演示的几句话 */
const TRY: Record<ChatMode, string> = {
  tasks: '"我还有哪些任务没做完"、"帮我加个任务：买咖啡豆"',
  code: '"列出文件"、"跑一下构建"、"给 average 加空数组保护"',
  sdk: '"读一下 README.md"、"新建 notes.md"',
}

/**
 * 标题栏。它是 <Static> 的第一项，只画一次 —— /mode 切换模式后它不会跟着变，
 * 当前模式一直显示在状态栏最左边；清屏（/clear、Ctrl+L）或 /new 之后，标题栏会按当前模式重画。
 */
export function Header({ apiUrl, mode }: { apiUrl: string; mode: ChatMode }) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} marginBottom={1}>
      <Text>
        <Text bold color="cyan">
          ✻ TaskFlow Copilot
        </Text>
        <Text dimColor> · 终端版</Text>
      </Text>
      <Text dimColor>
        后端：{apiUrl} · 模式：{mode}
      </Text>
      <Text dimColor>试试：{TRY[mode]}</Text>
      <Text dimColor>输入 /help 查看命令，/mode 切换模式</Text>
    </Box>
  )
}
