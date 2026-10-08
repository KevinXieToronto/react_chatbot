import { Box, Text } from 'ink'

export function Header({ apiUrl }: { apiUrl: string }) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} marginBottom={1}>
      <Text>
        <Text bold color="cyan">
          ✻ TaskFlow Copilot
        </Text>
        <Text dimColor> · 终端版</Text>
      </Text>
      <Text dimColor>后端：{apiUrl}</Text>
      <Text dimColor>试试："我还有哪些任务没做完"、"帮我加个任务：买咖啡豆"</Text>
    </Box>
  )
}
