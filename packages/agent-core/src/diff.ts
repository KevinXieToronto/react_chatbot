import { z } from 'zod'

// ── 服务端发来的数据（jsdiff structuredPatch 的结果）───────────────
// 来自网络，先过 schema（第 17 章的规矩）

export const DiffHunkSchema = z.object({
  oldStart: z.number(),
  oldLines: z.number(),
  newStart: z.number(),
  newLines: z.number(),
  /** 每行以 ' '（未改）、'-'（删除）、'+'（新增）或 '\'（"文件末尾没有换行"提示）开头 */
  lines: z.array(z.string()),
})

export const DiffPreviewSchema = z.object({
  path: z.string(),
  isNew: z.boolean(),
  additions: z.number(),
  deletions: z.number(),
  /** 改动太多，服务端没发 hunks */
  tooLarge: z.boolean(),
  hunks: z.array(DiffHunkSchema),
})

export type DiffHunk = z.infer<typeof DiffHunkSchema>
export type DiffPreview = z.infer<typeof DiffPreviewSchema>

// ── 渲染用的行 ─────────────────────────────────────────

/** 一行代码：未改 / 新增 / 删除，带新旧两边的行号 */
export interface DiffLine {
  kind: 'context' | 'add' | 'del'
  text: string
  oldNo: number | null
  newNo: number | null
}

/** gap：两个 hunk 之间有一段服务端没发来的内容 */
export type DiffRow = DiffLine | { kind: 'gap' }

/** 把 hunks 展开成一行一行，并算出每行的新旧行号 */
export function hunksToRows(hunks: DiffHunk[]): DiffRow[] {
  const rows: DiffRow[] = []

  hunks.forEach((h, i) => {
    // 第一个 hunk 不是从第 1 行开始，或者 hunk 之间不连续 —— 中间有看不到的内容
    if (i > 0 || h.oldStart > 1) rows.push({ kind: 'gap' })

    let oldNo = h.oldStart
    let newNo = h.newStart
    for (const raw of h.lines) {
      const mark = raw[0]
      const text = raw.slice(1)
      if (mark === '\\') continue // "\ No newline at end of file"
      if (mark === '+') rows.push({ kind: 'add', text, oldNo: null, newNo: newNo++ })
      else if (mark === '-') rows.push({ kind: 'del', text, oldNo: oldNo++, newNo: null })
      else rows.push({ kind: 'context', text, oldNo: oldNo++, newNo: newNo++ })
    }
  })

  return rows
}

// ── 折叠未改动的上下文 ─────────────────────────────────────

export type DiffSegment =
  | { type: 'rows'; rows: DiffRow[] }
  /** 被折叠的一段未改动代码，id 用来记住"用户展开了哪几段" */
  | { type: 'fold'; id: number; rows: DiffLine[] }

/**
 * 把连续的未改动行折叠起来，只在改动前后各留 context 行。
 * 少于 minFold 行的就不折叠了 —— "展开 1 行"这种按钮比直接显示那一行还占地方。
 */
export function foldContext(rows: DiffRow[], context = 3, minFold = 4): DiffSegment[] {
  const segments: DiffSegment[] = []
  let buffer: DiffRow[] = []
  let foldId = 0

  const flush = () => {
    if (buffer.length > 0) segments.push({ type: 'rows', rows: buffer })
    buffer = []
  }

  let i = 0
  while (i < rows.length) {
    if (rows[i].kind !== 'context') {
      buffer.push(rows[i])
      i++
      continue
    }

    // 找出这一段连续的未改动行 [i, j)
    let j = i
    while (j < rows.length && rows[j].kind === 'context') j++
    const run = rows.slice(i, j) as DiffLine[]

    // 前面挨着改动就保留开头 context 行，后面挨着改动就保留结尾 context 行
    const keepHead = i > 0 ? context : 0
    const keepTail = j < rows.length ? context : 0
    const hidden = run.length - keepHead - keepTail

    if (hidden >= minFold) {
      buffer.push(...run.slice(0, keepHead))
      flush()
      segments.push({ type: 'fold', id: foldId++, rows: run.slice(keepHead, run.length - keepTail) })
      buffer.push(...run.slice(run.length - keepTail))
    } else {
      buffer.push(...run)
    }
    i = j
  }

  flush()
  return segments
}

// ── 并排视图 ──────────────────────────────────────────

export type SplitRow = { gap: true } | { gap?: false; left: DiffLine | null; right: DiffLine | null }

/**
 * 统一视图的行 → 左右并排的行。
 * 一段连续的删除 + 紧跟着的一段新增，按顺序两两配对放在同一行，多出来的那边留空。
 */
export function toSplitRows(rows: DiffRow[]): SplitRow[] {
  const out: SplitRow[] = []
  let i = 0

  while (i < rows.length) {
    const row = rows[i]

    if (row.kind === 'gap') {
      out.push({ gap: true })
      i++
    } else if (row.kind === 'context') {
      out.push({ left: row, right: row })
      i++
    } else {
      const dels: DiffLine[] = []
      const adds: DiffLine[] = []
      while (i < rows.length && rows[i].kind === 'del') dels.push(rows[i++] as DiffLine)
      while (i < rows.length && rows[i].kind === 'add') adds.push(rows[i++] as DiffLine)
      for (let k = 0; k < Math.max(dels.length, adds.length); k++) {
        out.push({ left: dels[k] ?? null, right: adds[k] ?? null })
      }
    }
  }

  return out
}
