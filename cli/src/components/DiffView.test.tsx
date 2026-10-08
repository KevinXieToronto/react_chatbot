import { describe, expect, it } from 'vitest'
import { render } from 'ink-testing-library'
import type { DiffPreview } from '@taskflow/agent-core'
import { DiffView } from './DiffView'

/** 第 31 章"给 average 加空数组保护"那次改动的样子：前面有 11 行没变 */
const preview: DiffPreview = {
  path: 'src/math.js',
  isNew: false,
  additions: 2,
  deletions: 0,
  tooLarge: false,
  hunks: [
    {
      oldStart: 1,
      oldLines: 15,
      newStart: 1,
      newLines: 17,
      lines: [
        ...Array.from({ length: 13 }, (_, i) => ` line ${i + 1}`),
        ' export function average(nums) {',
        '+  // 空数组没有平均值，返回 0 而不是 NaN',
        '+  if (nums.length === 0) return 0',
        '   return sum(nums) / nums.length',
      ],
    },
  ],
}

describe('DiffView', () => {
  it('标题行有路径和统计；新增行带 + 号和新行号；前面的未改动行被折叠', () => {
    const { lastFrame } = render(<DiffView preview={preview} />)
    const out = lastFrame() ?? ''
    expect(out).toContain('src/math.js +2 −0')
    expect(out).toContain('⋯ 省略 11 行未改动的代码')
    expect(out).toContain('   15 +   // 空数组没有平均值')
    expect(out).toContain('14 14   export function average(nums) {')
  })

  it('不只靠颜色：纯文本里也看得出新增和删除', () => {
    const del: DiffPreview = {
      ...preview,
      additions: 1,
      deletions: 1,
      hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ['-old', '+new'] }],
    }
    const out = render(<DiffView preview={del} />).lastFrame() ?? ''
    expect(out).toContain('1   - old')
    expect(out).toContain('  1 + new')
  })

  it('行数太多：截断并提示还有多少行', () => {
    const big: DiffPreview = {
      ...preview,
      isNew: true,
      additions: 50,
      hunks: [{ oldStart: 0, oldLines: 0, newStart: 1, newLines: 50, lines: Array.from({ length: 50 }, (_, i) => `+row ${i}`) }],
    }
    const out = render(<DiffView preview={big} maxRows={10} />).lastFrame() ?? ''
    expect(out).toContain('（新文件）')
    expect(out).toContain('… 还有 40 行没有显示')
  })

  it('diff 太大（服务端没发 hunks）：只显示统计和说明', () => {
    const huge: DiffPreview = { ...preview, isNew: true, additions: 3004, tooLarge: true, hunks: [] }
    const out = render(<DiffView preview={huge} />).lastFrame() ?? ''
    expect(out).toContain('+3004')
    expect(out).toContain('改动太大，终端里不显示 diff')
  })
})
