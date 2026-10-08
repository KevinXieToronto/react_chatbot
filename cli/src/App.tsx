import { useState } from 'react'
import { Box, Static, Text, useApp, useInput, useWindowSize } from 'ink'
import TextInput from 'ink-text-input'
import type { StreamChat } from '@taskflow/agent-core'
import { API_URL } from './api'
import { useChat } from './useChat'
import { liveItems, type Entry } from './transcript'
import { BlockView, EntryView } from './components/EntryView'
import { StatusBar } from './components/StatusBar'
import { ToolLine } from './components/ToolLine'

interface Props {
  /** 测试时注入假的流；不传就用真正的 fetch */
  stream?: StreamChat
  timeoutMs?: number
}

/** 标题栏是 <Static> 的第一项，永远在最上面 */
const HEADER: Entry = { kind: 'header', id: 'header' }

export function App({ stream, timeoutMs }: Props) {
  const { exit } = useApp()
  // 终端的宽高。用户拖动窗口大小时，这个 Hook 会让组件重新渲染
  const { columns, rows } = useWindowSize()
  const { messages, entries, turn, live, outputs, context, usage, lastUsage, busy, send, abort } = useChat({
    stream,
    timeoutMs,
  })
  const [input, setInput] = useState('')

  // 全局快捷键。ink-text-input 自己会忽略 Ctrl+C，所以两边不冲突
  useInput((char, key) => {
    const ctrlC = key.ctrl && char === 'c'
    if (busy) {
      if (ctrlC || key.escape) abort() // 忙：中止这一轮
      return
    }
    if (ctrlC) exit() // 空闲：退出程序
  })

  function handleSubmit(value: string) {
    if (!value.trim() || busy) return
    setInput('')
    void send(value)
  }

  // 正在输出的代码块最多显示几行：给输入框、状态栏和别的内容留出 12 行。
  // 动态区一旦比窗口还高，Ink 就只能整屏重画（第 35 章），会闪
  const liveCodeLines = Math.max(3, rows - 12)

  return (
    <Box flexDirection="column">
      {/* 写进去就不再重画。现在连"一条回复里写完的段落"也会一块块地进来 */}
      <Static items={[HEADER, ...entries]}>
        {(entry) => <EntryView key={entry.id} entry={entry} width={columns} apiUrl={API_URL} />}
      </Static>

      {/* 动态区：只剩还在跑的工具、还没写完的那一块 */}
      {busy &&
        liveItems(live.segments, live.cursor, turn.toolCalls).map((item) =>
          item.kind === 'tool' ? (
            <ToolLine key={item.key} call={item.call} output={outputs[item.call.id]} />
          ) : (
            <BlockView
              key={item.key}
              token={item.token}
              lead={item.lead}
              width={columns}
              maxCodeLines={item.last ? liveCodeLines : undefined}
            />
          ),
        )}

      <Box borderStyle="round" borderColor={busy ? 'gray' : 'cyan'} paddingX={1}>
        <Text color={busy ? 'gray' : 'cyan'}>❯ </Text>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          focus={!busy}
          placeholder={busy ? '等待回复中…' : '输入消息，Enter 发送'}
        />
      </Box>
      <Box paddingX={1}>
        <StatusBar
          turn={turn}
          busy={busy}
          count={messages.length}
          context={context}
          usage={usage}
          lastUsage={lastUsage}
        />
      </Box>
    </Box>
  )
}
