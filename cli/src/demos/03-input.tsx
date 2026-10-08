import { useState } from 'react'
import { render, Box, Text, useApp, useInput } from 'ink'

const OPTIONS = ['查询任务', '创建任务', '更新任务', '删除任务']

function Menu() {
  const { exit } = useApp()
  const [index, setIndex] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)

  // 终端里没有 onClick / onKeyDown，所有按键都从 useInput 进来。
  // input 是按下的字符，key 是一组布尔值（方向键、回车、Esc、Ctrl…）
  useInput((input, key) => {
    if (key.upArrow) setIndex((i) => (i - 1 + OPTIONS.length) % OPTIONS.length)
    if (key.downArrow) setIndex((i) => (i + 1) % OPTIONS.length)
    if (key.return) setPicked(OPTIONS[index])
    if (input === 'q' || key.escape) exit()
  })

  return (
    <Box flexDirection="column">
      <Text dimColor>↑/↓ 选择，Enter 确认，q 或 Esc 退出</Text>
      {OPTIONS.map((opt, i) => (
        <Text key={opt} color={i === index ? 'cyan' : undefined}>
          {i === index ? '❯ ' : '  '}
          {opt}
        </Text>
      ))}
      {picked && <Text color="green">你选了：{picked}</Text>}
    </Box>
  )
}

render(<Menu />)
