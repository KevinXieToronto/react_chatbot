// runShell 会真的起子进程，所以用 node -e 写命令 —— 在 cmd 和 sh 下都能跑

import { describe, it, expect } from 'vitest'
import { runShell, clipOutput } from './shell.js'

describe('runShell', () => {
  it('收集输出和退出码', async () => {
    const r = await runShell('node -e "console.log(123); process.exit(3)"')
    expect(r.exitCode).toBe(3)
    expect(r.output).toContain('123')
    expect(r.timedOut).toBe(false)
  })

  it('子进程只拿得到白名单里的环境变量', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-secret'
    process.env.TASKFLOW_TOKEN = 'token-test-secret'
    process.env.SOME_OTHER_SECRET = 'other-secret'
    try {
      const r = await runShell(
        'node -e "const e = process.env; console.log(e.ANTHROPIC_API_KEY, e.TASKFLOW_TOKEN, e.SOME_OTHER_SECRET, Boolean(e.PATH))"',
      )
      // 三个秘密都看不到，PATH 还在（不然连 node 都找不到）
      expect(r.output.trim()).toBe('undefined undefined undefined true')
    } finally {
      delete process.env.ANTHROPIC_API_KEY
      delete process.env.TASKFLOW_TOKEN
      delete process.env.SOME_OTHER_SECRET
    }
  })

  it('超时会杀掉整棵进程树', async () => {
    const started = Date.now()
    const r = await runShell('node -e "setTimeout(() => {}, 60000)"', { timeoutMs: 500 })
    expect(r.timedOut).toBe(true)
    // 远远不到 60 秒就返回了，说明孙子进程（node）也被杀了
    expect(Date.now() - started).toBeLessThan(10_000)
  })

  it('中止信号同样会杀进程', async () => {
    const ctrl = new AbortController()
    setTimeout(() => ctrl.abort(), 300)
    const r = await runShell('node -e "setTimeout(() => {}, 60000)"', { signal: ctrl.signal })
    expect(r.aborted).toBe(true)
  })
})

describe('clipOutput', () => {
  it('短输出原样返回', () => {
    expect(clipOutput('abc', 10)).toBe('abc')
  })

  it('长输出保留开头和结尾', () => {
    const text = 'H'.repeat(100) + 'M'.repeat(1000) + 'T'.repeat(100)
    const clipped = clipOutput(text, 200)
    expect(clipped.startsWith('HHHH')).toBe(true)
    expect(clipped.endsWith('TTTT')).toBe(true)
    expect(clipped).toContain('中间省略')
  })
})
