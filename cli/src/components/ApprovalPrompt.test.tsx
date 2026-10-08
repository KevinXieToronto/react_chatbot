import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from 'ink-testing-library'
import type { PendingApproval } from '@taskflow/agent-core'
import { ApprovalPrompt, KEY_GUARD_MS } from './ApprovalPrompt'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const approval: PendingApproval = {
  approvalId: 'a1',
  toolUseId: 't1',
  name: 'run_command',
  input: { command: 'npm test' },
  reason: '会在工作区执行一条命令',
  expiresAt: Date.now() + 120_000,
}

function setup() {
  const onDecide = vi.fn(async () => {})
  const onAbort = vi.fn()
  const r = render(<ApprovalPrompt approval={approval} onDecide={onDecide} onAbort={onAbort} maxDiffRows={20} />)
  return { ...r, onDecide, onAbort }
}

afterEach(() => {
  cleanup()
})

describe('ApprovalPrompt', () => {
  it('显示工具、原因、命令和按键说明', () => {
    const { lastFrame } = setup()
    const out = lastFrame() ?? ''
    expect(out).toContain('⚠ 需要你确认 · 运行命令')
    expect(out).toContain('会在工作区执行一条命令')
    expect(out).toContain('$ npm test')
    expect(out).toContain('y 允许 · n 拒绝 · e 拒绝并附说明')
    expect(out).toMatch(/1[12]\d 秒后自动拒绝/)
  })

  it('刚出现时不认按键：提前打的 y 不会变成批准', async () => {
    const { stdin, onDecide } = setup()
    await sleep(50)
    stdin.write('y')
    await sleep(50)
    expect(onDecide).not.toHaveBeenCalled()

    await sleep(KEY_GUARD_MS + 200)
    stdin.write('y')
    await vi.waitFor(() => expect(onDecide).toHaveBeenCalledWith('allow', '', false))
  })

  it('a：允许，并且以后自动允许', async () => {
    const { stdin, onDecide } = setup()
    await sleep(KEY_GUARD_MS + 200)
    stdin.write('a')
    await vi.waitFor(() => expect(onDecide).toHaveBeenCalledWith('allow', '', true))
  })

  it('e：写一句说明再拒绝', async () => {
    const { stdin, lastFrame, onDecide } = setup()
    await sleep(KEY_GUARD_MS + 200)
    stdin.write('e')
    await vi.waitFor(() => expect(lastFrame()).toContain('拒绝，并告诉 AI 为什么'))
    await sleep(100) // 等备注输入框挂上它的 useInput
    stdin.write('先别跑测试')
    await sleep(100)
    stdin.write('\r')
    await vi.waitFor(() => expect(onDecide).toHaveBeenCalledWith('deny', '先别跑测试', false))
  })

  it('写说明时 Esc 只是返回；再按 Esc 才是拒绝并中止', async () => {
    const { stdin, lastFrame, onAbort } = setup()
    await sleep(KEY_GUARD_MS + 200)
    stdin.write('e')
    await vi.waitFor(() => expect(lastFrame()).toContain('拒绝，并告诉 AI 为什么'))
    stdin.write('\u001B')
    await vi.waitFor(() => expect(lastFrame()).toContain('y 允许'))
    expect(onAbort).not.toHaveBeenCalled()
    stdin.write('\u001B')
    await vi.waitFor(() => expect(onAbort).toHaveBeenCalled())
  })
})
