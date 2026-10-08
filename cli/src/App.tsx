import { useState } from 'react'
import { Box, Static, Text, useApp, useInput } from 'ink'
import TextInput from 'ink-text-input'
import type { ChatMessage, StreamChat } from '@taskflow/agent-core'
import { API_URL } from './api'
import { useChat } from './useChat'
import { Header } from './components/Header'
import { MessageItem } from './components/MessageItem'
import { StatusBar } from './components/StatusBar'

interface Props {
  /** 测试时注入假的流；不传就用真正的 fetch */
  stream?: StreamChat
  timeoutMs?: number
}

/** <Static> 的条目：第一条是标题栏，后面都是定稿的消息 */
type StaticItem = { kind: 'header'; id: string } | { kind: 'message'; id: string; message: ChatMessage }

const HEADER_ITEM: StaticItem = { kind: 'header', id: 'header' }

export function App({ stream, timeoutMs }: Props) {
  const { exit } = useApp()
  const { messages, turn, busy, send, abort } = useChat({ stream, timeoutMs })
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

  const staticItems: StaticItem[] = [
    HEADER_ITEM,
    ...messages.map((m) => ({ kind: 'message' as const, id: m.id, message: m })),
  ]

  // 进行中的这一轮，临时拼成一条消息，好复用 MessageItem
  const live: ChatMessage | null = busy
    ? {
        id: 'live',
        role: 'assistant',
        content: turn.text,
        toolCalls: turn.toolCalls,
        status: 'streaming',
        createdAt: '',
      }
    : null

  return (
    <Box flexDirection="column">
      {/* 写进去就不再重画：历史再长，每个 token 也只重画下面那一小块 */}
      <Static items={staticItems}>
        {(item) =>
          item.kind === 'header' ? (
            <Header key={item.id} apiUrl={API_URL} />
          ) : (
            <MessageItem key={item.id} message={item.message} />
          )
        }
      </Static>

      {/* 以下是"动态区"：每次 setState 都会整块擦掉重画 */}
      {live && <MessageItem message={live} />}

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
        <StatusBar turn={turn} busy={busy} count={messages.length} />
      </Box>
    </Box>
  )
}
