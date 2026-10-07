import { describe, it, expect } from 'vitest'
import { buildPreview, hashContent } from './diffPreview.js'

const before = ['a', 'b', 'c', 'd', 'e', ''].join('\n')
const after = ['a', 'b', 'C', 'd', 'e', 'f', ''].join('\n')

describe('buildPreview', () => {
  it('统计增删行数，并返回带全文上下文的 hunk', () => {
    const p = buildPreview('x.js', before, after)
    expect(p).toMatchObject({ path: 'x.js', additions: 2, deletions: 1, tooLarge: false })
    expect(p.hunks).toHaveLength(1)
    expect(p.hunks[0].lines).toEqual([' a', ' b', '-c', '+C', ' d', ' e', '+f'])
  })

  it('CRLF 和 LF 不算差异', () => {
    const p = buildPreview('x.js', before.replace(/\n/g, '\r\n'), before)
    expect(p.additions + p.deletions).toBe(0)
    expect(p.hunks).toHaveLength(0)
  })

  it('新文件：全部是新增', () => {
    const p = buildPreview('new.js', '', 'x\ny\n', { isNew: true })
    expect(p).toMatchObject({ isNew: true, additions: 2, deletions: 0 })
  })

  it('改动太多时标记 tooLarge，不发 hunks', () => {
    const big = Array.from({ length: 1500 }, (_, i) => `line ${i}`).join('\n')
    const p = buildPreview('big.js', '', big, { isNew: true })
    expect(p.tooLarge).toBe(true)
    expect(p.hunks).toEqual([])
    expect(p.additions).toBe(1500)
  })
})

describe('hashContent', () => {
  it('内容一样指纹一样，差一个字就不一样', () => {
    expect(hashContent('abc')).toBe(hashContent('abc'))
    expect(hashContent('abc')).not.toBe(hashContent('abd'))
  })
})
