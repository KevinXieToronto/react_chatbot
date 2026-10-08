import { useState } from 'react'
import { render, Box, Text, useApp, useInput, usePaste } from 'ink'

/** 按键探测器：你的终端按下某个键时，程序到底收到了什么 */
function Keys() {
  const { exit } = useApp()
  const [log, setLog] = useState<string[]>([])
  const add = (line: string) => setLog((prev) => [...prev.slice(-14), line])

  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      exit()
      return
    }
    const flags = Object.entries(key)
      .filter(([, v]) => v === true)
      .map(([k]) => k)
    add(`input=${JSON.stringify(input)}  key=${flags.join('+') || '（无）'}`)
  })
  usePaste((text) => add(`paste=${JSON.stringify(text)}`))

  return (
    <Box flexDirection="column">
      <Text dimColor>按键看看终端送来了什么，Ctrl+C 退出。</Text>
      <Text dimColor>试试：Enter、Shift+Enter、Ctrl+Enter、Ctrl+J、Alt+Enter、Shift+Tab、粘贴一段多行文字</Text>
      {log.map((line, i) => (
        <Text key={i}>{line}</Text>
      ))}
    </Box>
  )
}

render(<Keys />, {
  exitOnCtrlC: false,
  kittyKeyboard: process.env.TASKFLOW_KITTY_KEYBOARD === '1' ? { mode: 'enabled' } : undefined,
})
