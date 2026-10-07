import { describe, it, expect, beforeEach } from 'vitest'
import { appendOutput, clearOutputs, hasOutput, readOutput, subscribeOutput } from './terminalBuffer'

describe('terminalBuffer', () => {
  beforeEach(() => {
    clearOutputs()
  })

  it('存下输出，重放时按顺序给出', () => {
    appendOutput('t1', 'stdout', 'a')
    appendOutput('t1', 'stderr', 'b')
    expect(hasOutput('t1')).toBe(true)
    expect(readOutput('t1').map((c) => c.text)).toEqual(['a', 'b'])
    expect(readOutput('t2')).toEqual([])
  })

  it('订阅者实时收到新输出，退订后不再收到', () => {
    const got: string[] = []
    const unsubscribe = subscribeOutput('t1', (c) => got.push(c.text))
    appendOutput('t1', 'stdout', 'x')
    appendOutput('t2', 'stdout', '别的命令')
    unsubscribe()
    appendOutput('t1', 'stdout', 'y')
    expect(got).toEqual(['x'])
  })

  it('太长时丢掉开头，并在重放时提示', () => {
    const big = 'x'.repeat(200 * 1024)
    appendOutput('t1', 'stdout', big)
    appendOutput('t1', 'stdout', big)
    const replay = readOutput('t1')
    expect(replay[0].text).toContain('已省略')
    expect(replay).toHaveLength(2)
  })
})
