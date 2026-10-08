import { Box, Text } from 'ink'
import { TOOL_LABELS, type ToolCall } from '@taskflow/agent-core'
import { tailLines } from '../outputTail'

/** 命令运行时，下面最多显示几行实时输出 */
const OUTPUT_LINES = 5

interface Props {
  call: ToolCall
  /** 这次调用到目前为止的命令输出（第 32 章的 tool_output），没有就不传 */
  output?: string
}

/**
 * 一次工具调用 = 一行：⏺ 查询任务 … ✓ 找到 2 条任务
 * 命令还在跑的时候，下面用 ⎿ 显示最后几行输出；跑完只留一句 summary。
 */
export function ToolLine({ call, output }: Props) {
  const label = TOOL_LABELS[call.name] ?? call.name
  const color =
    call.status === 'running' || call.status === 'awaiting'
      ? 'yellow'
      : call.status === 'success'
        ? 'green'
        : 'red'
  const lines = call.status === 'running' && output ? tailLines(output, OUTPUT_LINES) : []

  return (
    <Box flexDirection="column">
      {/* 一整行用一个 <Text> 套起来：太长时整体折行，而不是把 ⏺ 挤扁 */}
      <Text>
        <Text color={color}>⏺ </Text>
        <Text bold>{label}</Text>
        <Text dimColor> ({call.name})</Text>
        {call.status === 'running' && <Text dimColor> …</Text>}
        {call.status === 'awaiting' && <Text color="yellow"> 等你确认</Text>}
        {call.status === 'success' && <Text color="green"> ✓ {call.summary}</Text>}
        {call.status === 'error' && <Text color="red"> ✗ {call.summary}</Text>}
      </Text>
      {lines.map((line, i) => (
        // truncate-end：长行截断而不是折行，动态区的高度才稳定
        <Text key={i} dimColor wrap="truncate-end">
          {i === 0 ? '  ⎿ ' : '    '}
          {line}
        </Text>
      ))}
    </Box>
  )
}
