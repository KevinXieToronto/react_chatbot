import { createHash } from 'node:crypto'
import { structuredPatch } from 'diff'

/** 新旧两边加起来不超过这么多行时，发"全文上下文"的 diff，前端可以自己折叠 / 展开 */
const FULL_CONTEXT_MAX_LINES = 2000
/** 改动（增 + 删）超过这么多行，就不发 hunks 了，前端显示"diff 太大" */
const MAX_CHANGED_LINES = 1000

/** 文件内容的指纹。审批前算一次，执行前再算一次，对不上就说明文件被改过 */
export function hashContent(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

function countLines(text) {
  if (text === '') return 0
  return text.split('\n').length
}

/**
 * 算出"要写进去的内容"和"现在的内容"之间的差异，给审批卡片用。
 *
 * 用 jsdiff 的 structuredPatch：它返回结构化的 hunks，
 * 每个 hunk 有起始行号和一组以 ' ' / '-' / '+' 开头的行 —— 前端直接就能渲染。
 *
 * @returns {{ path, isNew, additions, deletions, tooLarge, hunks }}
 */
export function buildPreview(path, oldText, newText, { isNew = false } = {}) {
  // CRLF 统一成 LF 再比较，否则 Windows 文件每一行都会显示成"改了"（多了个 \r）
  const a = oldText.replace(/\r\n/g, '\n')
  const b = newText.replace(/\r\n/g, '\n')

  // 小文件：上下文给到"整个文件"，这样前端手上有全部未改动的行，
  // 可以把它们折叠成"展开 N 行"，用户点开就能看，不用再请求一次。
  // 大文件：只给改动前后各 3 行（标准 unified diff 的默认值），hunk 之间的内容前端看不到。
  const context = countLines(a) + countLines(b) <= FULL_CONTEXT_MAX_LINES ? Number.MAX_SAFE_INTEGER : 3

  const patch = structuredPatch(path, path, a, b, '', '', { context })

  let additions = 0
  let deletions = 0
  for (const hunk of patch.hunks) {
    for (const line of hunk.lines) {
      if (line.startsWith('+')) additions++
      else if (line.startsWith('-')) deletions++
    }
  }

  if (additions + deletions > MAX_CHANGED_LINES) {
    // 太大的 diff 没法在一张卡片里审，也别把几 MB 的 JSON 推给浏览器
    return { path, isNew, additions, deletions, tooLarge: true, hunks: [] }
  }

  return {
    path,
    isNew,
    additions,
    deletions,
    tooLarge: false,
    hunks: patch.hunks.map((h) => ({
      oldStart: h.oldStart,
      oldLines: h.oldLines,
      newStart: h.newStart,
      newLines: h.newLines,
      lines: h.lines,
    })),
  }
}
