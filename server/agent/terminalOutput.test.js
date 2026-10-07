import { describe, it, expect, vi, afterEach } from 'vitest'
import { createLineDecoder, createOutputThrottle, toPlainText } from './terminalOutput.js'

// "中文" 的两种编码
const UTF8 = Buffer.from('中文', 'utf8') // e4 b8 ad e6 96 87
const GBK = Buffer.from([0xd6, 0xd0, 0xce, 0xc4])

describe('createLineDecoder', () => {
  it('UTF-8 字符被切在两块中间也能解对', () => {
    const d = createLineDecoder(null)
    // 第一块只有"中"的前两个字节
    expect(d.write(UTF8.subarray(0, 2))).toBe('')
    expect(d.write(Buffer.concat([UTF8.subarray(2), Buffer.from('\n')]))).toBe('中文\n')
  })

  it('不是合法 UTF-8 的行按控制台代码页（GBK）解码', () => {
    const d = createLineDecoder('gbk')
    expect(d.write(Buffer.concat([GBK, Buffer.from('\r\n')]))).toBe('中文\r\n')
  })

  it('同一段输出里 UTF-8 行和 GBK 行各自解对', () => {
    const d = createLineDecoder('gbk')
    const mixed = Buffer.concat([UTF8, Buffer.from('\n'), GBK, Buffer.from('\n')])
    expect(d.write(mixed)).toBe('中文\n中文\n')
  })

  it('没有换行的尾巴在 end() 时吐出来', () => {
    const d = createLineDecoder(null)
    expect(d.write(Buffer.from('50%'))).toBe('')
    expect(d.end()).toBe('50%')
  })

  it('\\r 也是安全的切分点（进度条）', () => {
    const d = createLineDecoder(null)
    expect(d.write(Buffer.from('10%\r20%'))).toBe('10%\r')
    expect(d.end()).toBe('20%')
  })
})

describe('createOutputThrottle', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('把 50ms 内的小块合并成一次', () => {
    vi.useFakeTimers()
    const emit = vi.fn()
    const t = createOutputThrottle(emit, { intervalMs: 50 })
    t.push('stdout', 'a')
    t.push('stdout', 'b')
    t.push('stdout', 'c')
    expect(emit).not.toHaveBeenCalled()
    vi.advanceTimersByTime(50)
    expect(emit).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledWith('stdout', 'abc')
  })

  it('stdout / stderr 交替时保持顺序', () => {
    const emit = vi.fn()
    const t = createOutputThrottle(emit)
    t.push('stdout', 'one ')
    t.push('stderr', 'two ')
    t.push('stdout', 'three')
    t.close()
    expect(emit.mock.calls).toEqual([
      ['stdout', 'one '],
      ['stderr', 'two '],
      ['stdout', 'three'],
    ])
  })

  it('超过总量上限后不再推送', () => {
    const emit = vi.fn()
    const t = createOutputThrottle(emit, { maxTotal: 10 })
    t.push('stdout', '1234567890abc')
    t.push('stdout', 'more')
    t.close()
    expect(emit).toHaveBeenCalledTimes(1)
    expect(emit.mock.calls[0][1]).toContain('1234567890')
    expect(emit.mock.calls[0][1]).toContain('不再实时显示')
  })
})

describe('toPlainText', () => {
  it('去掉颜色代码', () => {
    expect(toPlainText('\x1b[32m✔ ok\x1b[39m')).toBe('✔ ok')
  })

  it('进度条只保留最后一帧，CRLF 不受影响', () => {
    expect(toPlainText('编译 10%\r编译 50%\r编译 100%\r\n完成\r\n')).toBe('编译 100%\n完成\n')
  })
})
