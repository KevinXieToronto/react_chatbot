import { describe, expect, it, vi } from 'vitest'
import { completeCommand, findCommand, parseCommand, suggestCommands, type CommandContext } from './commands'

function fakeContext(): CommandContext & { printed: string[] } {
  const printed: string[] = []
  return {
    printed,
    mode: 'tasks',
    setMode: vi.fn(),
    clearScreen: vi.fn(),
    newSession: vi.fn(),
    permissionMode: 'default',
    setPermissionMode: vi.fn(),
    exit: vi.fn(),
    print: (text) => printed.push(text),
    usage: null,
    lastUsage: null,
    context: null,
  }
}

describe('斜杠命令', () => {
  it('解析命令名和参数', () => {
    expect(parseCommand('/mode code')).toEqual({ name: 'mode', args: 'code' })
    expect(parseCommand('/HELP')).toEqual({ name: 'help', args: '' })
    expect(parseCommand('你好')).toBeNull()
  })

  it('补全：前缀匹配；要参数的命令补一个空格', () => {
    expect(suggestCommands('/c').map((c) => c.name)).toEqual(['clear', 'cost', 'context'])
    expect(completeCommand('/mo')).toBe('/mode ')
    expect(completeCommand('/he')).toBe('/help')
    expect(suggestCommands('/mode code')).toEqual([])
  })

  it('/mode：切换合法的模式，拒绝不认识的', () => {
    const ctx = fakeContext()
    findCommand('mode')!.run(ctx, 'code')
    expect(ctx.setMode).toHaveBeenCalledWith('code')

    const bad = fakeContext()
    findCommand('mode')!.run(bad, 'root')
    expect(bad.setMode).not.toHaveBeenCalled()
    expect(bad.printed[0]).toContain('没有 root 这个模式')
  })

  it('/permissions：切换权限模式', () => {
    const ctx = fakeContext()
    findCommand('permissions')!.run(ctx, 'accept-edits')
    expect(ctx.setPermissionMode).toHaveBeenCalledWith('acceptEdits')
  })

  it('/cost：累计用量和估算费用', () => {
    const ctx = { ...fakeContext(), usage: { input: 1000, output: 100, cacheRead: 0, cacheWrite: 0 } }
    findCommand('cost')!.run(ctx, '')
    expect(ctx.printed[0]).toContain('输入 1,000 · 输出 100')
    expect(ctx.printed[0]).toContain('$0.0075')
  })
})
