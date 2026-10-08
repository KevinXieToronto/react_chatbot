import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripVTControlCharacters } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { spawn, type IPty } from '@lydell/node-pty'
import pkg from '../package.json' with { type: 'json' }
import { startFakeServer, type FakeServer } from './fakeServer'

/** 测的是构建产物：用户装上之后运行的就是这个文件 */
const CLI = fileURLToPath(new URL('../dist/cli.mjs', import.meta.url))

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * 在伪终端（pseudo-terminal）里启动 CLI。
 *
 * 为什么不用 child_process.spawn？那样 stdin 是管道，不是终端：CLI 会打印
 * "请在交互式终端里运行"然后退出（第 35 章），Ink 也没法进入 raw mode。
 * node-pty 在 Windows 上用系统的 ConPTY 造一个真正的终端，CLI 以为自己跑在 Windows Terminal 里。
 */
function startCli(apiUrl: string, home: string) {
  const term: IPty = spawn(process.execPath, [CLI, '--api-url', apiUrl], {
    cols: 100,
    rows: 40,
    cwd: path.dirname(CLI),
    // NO_COLOR：输出里少一大半控制序列，断言更简单（第 39 章让它生效了）
    env: { ...process.env, TASKFLOW_HOME: home, NO_COLOR: '1' },
  })
  let output = ''
  term.onData((data) => {
    output += data
  })
  const exited = new Promise<number>((resolve) => term.onExit(({ exitCode }) => resolve(exitCode)))

  /** 终端上出现过的所有文字（去掉了颜色、光标移动这些控制序列） */
  const text = () => stripVTControlCharacters(output)

  async function waitFor(pattern: RegExp, timeoutMs = 20_000) {
    const start = Date.now()
    while (!pattern.test(text())) {
      if (Date.now() - start > timeoutMs) {
        throw new Error(`等了 ${timeoutMs}ms 也没看到 ${pattern}，屏幕上最后是：\n${text().slice(-1500)}`)
      }
      await sleep(50)
    }
  }

  /** 打一句话再回车。分两次写：一次写进去的 "你好\r" 会被当成粘贴（第 38 章），不会发送 */
  async function submit(line: string) {
    term.write(line)
    await sleep(150)
    term.write('\r')
  }

  return { term, text, waitFor, submit, exited }
}

let server: FakeServer
let home: string

beforeAll(async () => {
  if (!fs.existsSync(CLI)) throw new Error('找不到 dist/cli.mjs，先运行 npm run build（npm run test:e2e 会自动构建）')
  server = await startFakeServer()
  // 历史文件写到临时目录，不碰你真正的 %USERPROFILE%\.taskflow
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'taskflow-e2e-'))
})

afterAll(async () => {
  await server?.close()
})

describe('taskflow（构建产物）', () => {
  it('--version、--help 不需要终端，直接打印', () => {
    expect(execFileSync(process.execPath, [CLI, '--version'], { encoding: 'utf8' }).trim()).toBe(pkg.version)
    expect(execFileSync(process.execPath, [CLI, '--help'], { encoding: 'utf8' })).toContain('--api-url')
  })

  it('完整的一次会话：对话、切模式、审批、退出', async () => {
    const cli = startCli(server.url, home)
    try {
      await cli.waitFor(/就绪 · 0 条消息/, 30_000) // 第一次启动可能慢一些（刚构建完的文件会被杀毒软件扫描）
      expect(cli.text()).toContain(`后端：${server.url}`)

      // 流式回复，经过 Markdown 渲染（** 不见了）
      await cli.submit('你好')
      await cli.waitFor(/就绪 · 2 条消息/)
      expect(cli.text()).toContain('这里是假后端。')
      expect(cli.text()).not.toContain('**')
      expect(server.requests[0]).toEqual({ mode: 'tasks', text: '你好' })

      // 切模式：请求里带上 mode
      await cli.submit('/mode code')
      await cli.waitFor(/\[code\]/)

      // 审批：出现提示和 diff，按 y，假后端收到 allow
      await cli.submit('帮我改文件')
      await cli.waitFor(/需要你确认 · 修改文件/)
      expect(cli.text()).toContain('+ let x = 2')
      await sleep(600) // 按键保护期
      cli.term.write('y')
      await cli.waitFor(/改好了。/)
      expect(server.decisions).toEqual([{ approvalId: 'ap1', decision: 'allow', note: '' }])
      expect(server.requests[1]).toEqual({ mode: 'code', text: '帮我改文件' })

      // 空闲时 Ctrl+C：正常退出，退出码 0
      await cli.waitFor(/就绪 · 4 条消息/)
      cli.term.write('\u0003')
      expect(await cli.exited).toBe(0)
      expect(cli.text()).toContain('再见！')
    } finally {
      cli.term.kill()
    }
  })

  it('历史写进了 TASKFLOW_HOME 下的 history.json', () => {
    const history = JSON.parse(fs.readFileSync(path.join(home, 'history.json'), 'utf8'))
    expect(history).toEqual(['你好', '/mode code', '帮我改文件'])
  })
})
