import { Box, Text } from 'ink'
import type { ToolCall } from '../../../src/types/chat'
import { TOOL_LABELS } from '../../../src/features/copilot/turnReducer'

/** 一次工具调用 = 一行：⏺ 查询任务 … ✓ 找到 2 条任务 */
export function ToolLine({ call }: { call: ToolCall }) {
  const label = TOOL_LABELS[call.name] ?? call.name
  const color = call.status === 'running' ? 'yellow' : call.status === 'success' ? 'green' : 'red'

  return (
    <Box>
      <Text color={color}>⏺ </Text>
      <Text bold>{label}</Text>
      <Text dimColor> ({call.name})</Text>
      {call.status === 'running' && <Text dimColor> …</Text>}
      {call.status === 'success' && <Text color="green"> ✓ {call.summary}</Text>}
      {call.status === 'error' && <Text color="red"> ✗ {call.summary}</Text>}
    </Box>
  )
}
