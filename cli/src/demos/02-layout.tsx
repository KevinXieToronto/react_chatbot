import { useEffect, useState } from 'react'
import { render, Box, Text, Spacer, useApp } from 'ink'

const TASKS = [
  { title: '写周报', status: 'todo' },
  { title: '修复登录 bug', status: 'doing' },
  { title: '升级 React 19', status: 'done' },
]

const STATUS_COLOR: Record<string, string> = {
  todo: 'yellow',
  doing: 'blue',
  done: 'green',
}

function Layout() {
  const { exit } = useApp()
  const [seconds, setSeconds] = useState(0)

  // 每秒 setState 一次：整棵树重新渲染，Ink 重画这一帧
  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  // 5 秒后自己退出 —— useApp().exit() 相当于"卸载整个应用"
  useEffect(() => {
    if (seconds >= 5) exit()
  }, [seconds, exit])

  return (
    <Box flexDirection="column" width={60}>
      {/* 顶栏：左右两端对齐，中间用 Spacer 撑开 */}
      <Box borderStyle="single" paddingX={1}>
        <Text bold>TaskFlow</Text>
        <Spacer />
        <Text dimColor>已运行 {seconds} 秒</Text>
      </Box>

      {/* 主体：左边固定宽度，右边占满剩余空间（flexGrow） */}
      <Box>
        <Box width={16} flexDirection="column" borderStyle="single" paddingX={1}>
          <Text color="cyan">› 看板</Text>
          <Text>  统计</Text>
          <Text>  设置</Text>
        </Box>
        <Box flexGrow={1} flexDirection="column" borderStyle="single" paddingX={1}>
          {TASKS.map((t) => (
            <Box key={t.title} justifyContent="space-between">
              <Text>{t.title}</Text>
              <Text color={STATUS_COLOR[t.status]}>{t.status}</Text>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  )
}

render(<Layout />)
