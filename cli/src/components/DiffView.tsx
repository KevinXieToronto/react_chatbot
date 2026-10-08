import { Box, Text } from 'ink'
import { foldContext, hunksToRows, type DiffLine, type DiffPreview } from '@taskflow/agent-core'

interface Props {
  preview: DiffPreview
  /** 最多显示多少行（不含标题行）。动态区不能比窗口还高（第 35 章） */
  maxRows?: number
}

/** 终端里 Tab 的宽度由终端自己决定，Ink 算不准，统一换成两个空格 */
const detab = (s: string) => s.replace(/\t/g, '  ')

type Row = { kind: 'line'; line: DiffLine } | { kind: 'fold'; count: number } | { kind: 'gap' }

/**
 * 终端版的 diff（网页端是第 31 章的 DiffView）。数据是服务端算好的 hunks，
 * 展开成行、折叠上下文都用核心里的 hunksToRows / foldContext —— 和网页端是同一套逻辑。
 *
 *   src/math.js  +2 −0
 *      ⋯ 省略 11 行未改动的代码
 *    12  12   }
 *    13  13
 *        15 + // 空数组没有平均值……
 *
 * 不只靠颜色区分：每行都保留 + / - 标记。色弱的用户、NO_COLOR 的终端、
 * 复制出来的文本里，都还看得出哪行是新增、哪行是删除。
 */
export function DiffView({ preview, maxRows = 40 }: Props) {
  const header = (
    <Text>
      <Text bold>{preview.path}</Text>
      {preview.isNew && <Text color="green"> （新文件）</Text>}
      <Text color="green"> +{preview.additions}</Text>
      <Text color="red"> −{preview.deletions}</Text>
    </Text>
  )

  // 第 31 章：改动太大时服务端不发 hunks，只给统计
  if (preview.tooLarge) {
    return (
      <Box flexDirection="column">
        {header}
        <Text color="yellow">改动太大，终端里不显示 diff。可以在网页版的代码助手里查看，或者根据上面的统计和说明决定。</Text>
      </Box>
    )
  }

  // 展开成行 → 折叠连续的未改动行（前后各留 3 行）→ 拍平成要画的行
  const rows: Row[] = []
  for (const seg of foldContext(hunksToRows(preview.hunks))) {
    if (seg.type === 'fold') {
      rows.push({ kind: 'fold', count: seg.rows.length })
      continue
    }
    for (const r of seg.rows) rows.push(r.kind === 'gap' ? { kind: 'gap' } : { kind: 'line', line: r })
  }

  const shown = rows.slice(0, maxRows)
  const hidden = rows.length - shown.length
  // 行号的宽度按最大的行号算，新旧两列对齐
  const maxNo = Math.max(
    1,
    ...rows.flatMap((r) => (r.kind === 'line' ? [r.line.oldNo ?? 0, r.line.newNo ?? 0] : [])),
  )
  const w = String(maxNo).length
  const no = (n: number | null) => (n === null ? ' '.repeat(w) : String(n).padStart(w))

  return (
    <Box flexDirection="column">
      {header}
      {shown.map((row, i) => {
        if (row.kind === 'fold') {
          return (
            <Text key={i} dimColor>
              {' '.repeat(w * 2 + 2)}⋯ 省略 {row.count} 行未改动的代码
            </Text>
          )
        }
        if (row.kind === 'gap') {
          return (
            <Text key={i} dimColor>
              {' '.repeat(w * 2 + 2)}⋯
            </Text>
          )
        }
        const { kind, text, oldNo, newNo } = row.line
        const mark = kind === 'add' ? '+' : kind === 'del' ? '-' : ' '
        const color = kind === 'add' ? 'green' : kind === 'del' ? 'red' : undefined
        return (
          // truncate-end：长行截断，不折行 —— 折行后行号那一列就对不齐了
          <Text key={i} wrap="truncate-end">
            <Text dimColor>
              {no(oldNo)} {no(newNo)}{' '}
            </Text>
            <Text color={color}>
              {mark} {detab(text)}
            </Text>
          </Text>
        )
      })}
      {hidden > 0 && <Text dimColor>… 还有 {hidden} 行没有显示</Text>}
    </Box>
  )
}
