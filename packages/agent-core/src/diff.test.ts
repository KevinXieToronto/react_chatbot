import { describe, it, expect } from 'vitest'
import { hunksToRows, foldContext, toSplitRows } from './diff'
import type { DiffHunk, DiffLine } from './diff'

/** 造一个"全文上下文"的 hunk：total 行，第 changeAt 行被改掉 */
function hunkWithChangeAt(total: number, changeAt: number): DiffHunk {
  const lines: string[] = []
  for (let n = 1; n <= total; n++) {
    if (n === changeAt) lines.push(`-old ${n}`, `+new ${n}`)
    else lines.push(` line ${n}`)
  }
  return { oldStart: 1, oldLines: total, newStart: 1, newLines: total, lines }
}

describe('hunksToRows', () => {
  it('算出新旧两边的行号', () => {
    const rows = hunksToRows([
      { oldStart: 1, oldLines: 3, newStart: 1, newLines: 3, lines: [' a', '-b', '+B', '+B2', ' c'] },
    ]) as DiffLine[]
    expect(rows.map((r) => [r.kind, r.oldNo, r.newNo])).toEqual([
      ['context', 1, 1],
      ['del', 2, null],
      ['add', null, 2],
      ['add', null, 3],
      ['context', 3, 4],
    ])
  })

  it('跳过 "\\ No newline at end of file"', () => {
    const rows = hunksToRows([
      { oldStart: 1, oldLines: 0, newStart: 1, newLines: 1, lines: ['+x', '\\ No newline at end of file'] },
    ])
    expect(rows).toHaveLength(1)
  })

  it('hunk 之间插入 gap', () => {
    const rows = hunksToRows([
      { oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ['-a', '+A'] },
      { oldStart: 50, oldLines: 1, newStart: 50, newLines: 1, lines: ['-z', '+Z'] },
    ])
    expect(rows.map((r) => r.kind)).toEqual(['del', 'add', 'gap', 'del', 'add'])
  })
})

describe('foldContext', () => {
  it('改动前后各留 3 行，其余折叠', () => {
    const segments = foldContext(hunksToRows([hunkWithChangeAt(30, 15)]))
    // 开头 1~11 折叠，12~14 保留，改动，16~18 保留，19~30 折叠
    expect(segments.map((s) => (s.type === 'fold' ? `fold:${s.rows.length}` : `rows:${s.rows.length}`))).toEqual([
      'fold:11',
      'rows:8',
      'fold:12',
    ])
  })

  it('太短的未改动段不折叠', () => {
    const segments = foldContext(hunksToRows([hunkWithChangeAt(8, 4)]))
    expect(segments).toHaveLength(1)
    expect(segments[0].type).toBe('rows')
  })

  it('两处改动之间的长段只折叠中间', () => {
    const lines = [' 1', '-2', '+2', ...Array.from({ length: 10 }, (_, k) => ` ${k + 3}`), '-13', '+13']
    const segments = foldContext(hunksToRows([{ oldStart: 1, oldLines: 13, newStart: 1, newLines: 13, lines }]))
    const fold = segments.find((s) => s.type === 'fold')
    // 3~12 共 10 行，两头各留 3 行，折叠 4 行
    expect(fold?.rows.map((r) => r.oldNo)).toEqual([6, 7, 8, 9])
  })
})

describe('toSplitRows', () => {
  it('删除和新增两两配对，多出的一边留空', () => {
    const rows = hunksToRows([
      { oldStart: 1, oldLines: 2, newStart: 1, newLines: 3, lines: [' a', '-b', '+B1', '+B2'] },
    ])
    const split = toSplitRows(rows)
    expect(split).toHaveLength(3)
    const [, second, third] = split
    if (second.gap || third.gap) throw new Error('不应该有 gap')
    expect([second.left?.text, second.right?.text]).toEqual(['b', 'B1'])
    expect([third.left, third.right?.text]).toEqual([null, 'B2'])
  })
})
