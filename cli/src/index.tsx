#!/usr/bin/env node
// ↑ 第 40 章：shebang。装成全局命令后，macOS / Linux 靠它知道用 node 运行这个文件；
//   Windows 上 npm 生成 taskflow.cmd 时也是读这一行，才知道要调用 node。

import pkg from '../package.json' with { type: 'json' }
import { createCliClient } from './api'
import { HELP, resolveConfig } from './config'
import { resolveToken } from './token'

// 先处理 --help / --version 和配置错误：这些情况不需要加载 Ink，也不需要终端
const result = resolveConfig(process.argv.slice(2))
if (result.kind === 'help') {
  console.log(HELP)
  process.exit(0)
}
if (result.kind === 'version') {
  console.log(pkg.version)
  process.exit(0)
}
if (result.kind === 'error') {
  console.error(result.message)
  process.exit(1)
}
const { config } = result

// NO_COLOR（https://no-color.org）是"请不要输出颜色"的通行约定。
// 但 Ink 用的 chalk 不认它，只认 FORCE_COLOR=0；而且 chalk 在第一次被 import 时就决定了用不用颜色。
// 所以要在加载 Ink 之前把它翻译过去 —— 这也是下面用 await import() 而不是顶部 import 的原因：
// 顶部的 import 会先于这几行执行（打包之后也一样）。
if (process.env.NO_COLOR) process.env.FORCE_COLOR = '0'

const { render } = await import('ink')
const { App } = await import('./App')

// Ink 要把终端切到 raw mode 才能逐键读输入。
// 用管道喂输入（echo hi | taskflow）时 stdin 不是终端，直接给出提示
if (!process.stdin.isTTY) {
  console.error('请在交互式终端里运行（Windows Terminal / cmd），不要用管道或重定向。')
  process.exit(1)
}

// 令牌：--token > 环境变量 TASKFLOW_TOKEN > server/.env。找不到就不带，后端会回 401，界面上有提示
const client = createCliClient(config.apiUrl, resolveToken(config.token))

const { waitUntilExit } = render(
  <App
    apiUrl={config.apiUrl}
    initialMode={config.mode}
    stream={client.streamChat}
    submitApproval={client.submitApproval}
  />,
  {
    // Ctrl+C 交给 App 自己处理：忙的时候是"中止这一轮"，空闲时才是"退出"
    exitOnCtrlC: false,
    // 第 38 章：kitty 键盘协议能让 Shift+Enter 和 Enter 区分开，但要终端支持。
    // 默认不开，设了 TASKFLOW_KITTY_KEYBOARD=1 才开（原因见第 38 章第二节）
    kittyKeyboard: process.env.TASKFLOW_KITTY_KEYBOARD === '1' ? { mode: 'enabled' } : undefined,
  },
)

await waitUntilExit()
console.log('再见！')
