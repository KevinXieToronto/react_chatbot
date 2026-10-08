import { Box, Text } from 'ink'
import type { ChatMessage } from '@taskflow/agent-core'
import { ToolLine } from './ToolLine'

/** 一条消息。定稿的历史消息和正在流式的消息都用它画 */
export function MessageItem({ message }: { message: ChatMessage }) {
  if (message.role === 'user') {
    return (
      <Box marginBottom={1}>
        <Text color="cyan">❯ </Text>
        <Text>{message.content}</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" marginBottom={1}>
      {message.toolCalls?.map((call) => <ToolLine key={call.id} call={call} />)}

      {message.content !== '' && (
        <Box>
          <Text>⏺ </Text>
          {/* Box 的 flexShrink 默认是 1，长文本会在剩余宽度里自动折行 */}
          <Text>{message.content}</Text>
        </Box>
      )}

      {message.status === 'aborted' && (
        <Text color="yellow">  （{message.error ?? '已中止'}）</Text>
      )}
      {message.status === 'error' && <Text color="red">  ✗ {message.error}</Text>}
    </Box>
  )
}
