import { render } from 'ink'
import { App } from './App'

// Ink 要把终端切到 raw mode 才能逐键读输入。
// 用管道喂输入（echo hi | npm run dev）时 stdin 不是终端，直接给出提示
if (!process.stdin.isTTY) {
  console.error('请在交互式终端里运行（Windows Terminal / cmd），不要用管道或重定向。')
  process.exit(1)
}

// exitOnCtrlC: false —— Ctrl+C 交给 App 自己处理：
// 忙的时候是"中止这一轮"，空闲时才是"退出"
const { waitUntilExit } = render(<App />, { exitOnCtrlC: false })

await waitUntilExit()
console.log('再见！')
