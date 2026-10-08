import { Box, Text } from 'ink'
import { findCommand, parseCommand, suggestCommands } from '../commands'

/**
 * 输入框下面的补全提示：
 *   输入 "/m"       → 列出以 m 开头的命令，第一个高亮，Tab 补全它
 *   输入 "/mode "   → 提示参数写法
 */
export function CommandHint({ text }: { text: string }) {
  const matches = suggestCommands(text)

  if (matches.length === 0) {
    const parsed = /\s/.test(text) ? parseCommand(text) : null
    const cmd = parsed ? findCommand(parsed.name) : undefined
    if (!cmd?.args) return null
    return (
      <Box paddingX={2}>
        <Text dimColor>
          /{cmd.name} {cmd.args} —— {cmd.description}
        </Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" paddingX={2}>
      {matches.map((c, i) => (
        <Text key={c.name} color={i === 0 ? 'cyan' : undefined} dimColor={i !== 0}>
          {`/${c.name}${c.args ? ' ' + c.args : ''}`.padEnd(22)}
          {c.description}
        </Text>
      ))}
      <Text dimColor>Tab 补全</Text>
    </Box>
  )
}
