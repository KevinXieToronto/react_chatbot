/**
 * 多行输入框的编辑操作：全部是纯函数，输入一个状态、返回一个新状态。
 * 光标按"字符"（字素簇）计：中文、emoji（含肤色、国旗、ZWJ 序列）都算一个，
 * 左右移动、退格都不会停在半个字上。
 */
export interface EditState {
  value: string
  /** 光标在第几个字符前面（0 = 最前面） */
  cursor: number
}

export const EMPTY: EditState = { value: '', cursor: 0 }

// 按"用户看到的一个字"拆分。不能用 Array.from(s)：它按码点拆，
// 👍🏽（肤色）、🇨🇦（国旗）、👨‍👩‍👧（ZWJ 序列）都是好几个码点
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
export const chars = (s: string): string[] => Array.from(segmenter.segment(s), (part) => part.segment)

/** 用一段文字造一个状态，光标放在末尾 */
export function fromText(value: string): EditState {
  return { value, cursor: chars(value).length }
}

export function insert({ value, cursor }: EditState, text: string): EditState {
  const c = chars(value)
  const head = [...c.slice(0, cursor), ...chars(text)].join('')
  // 光标按"插入之后的头部有几个字"算：插入一个组合字符时，它可能和前一个字并成一个
  return { value: head + c.slice(cursor).join(''), cursor: chars(head).length }
}

export function backspace(s: EditState): EditState {
  if (s.cursor === 0) return s
  const c = chars(s.value)
  c.splice(s.cursor - 1, 1)
  return { value: c.join(''), cursor: s.cursor - 1 }
}

export function deleteForward(s: EditState): EditState {
  const c = chars(s.value)
  if (s.cursor >= c.length) return s
  c.splice(s.cursor, 1)
  return { value: c.join(''), cursor: s.cursor }
}

export function moveLeft(s: EditState): EditState {
  return { ...s, cursor: Math.max(0, s.cursor - 1) }
}

export function moveRight(s: EditState): EditState {
  return { ...s, cursor: Math.min(chars(s.value).length, s.cursor + 1) }
}

/** 光标在第几行、第几列（都从 0 开始），以及每一行的字符数 */
export function position({ value, cursor }: EditState) {
  const lines = value.split('\n').map((l) => chars(l).length)
  let rest = cursor
  let line = 0
  while (line < lines.length - 1 && rest > lines[line]) {
    rest -= lines[line] + 1 // +1 是换行符
    line++
  }
  return { line, column: rest, lines }
}

/** 第 line 行第 column 列 → 光标位置 */
function offsetOf(lines: number[], line: number, column: number): number {
  let offset = 0
  for (let i = 0; i < line; i++) offset += lines[i] + 1
  return offset + Math.min(column, lines[line])
}

/** 上移一行，列尽量不变。已经在第一行时返回 null —— 交给调用方去翻历史 */
export function moveUp(s: EditState): EditState | null {
  const { line, column, lines } = position(s)
  if (line === 0) return null
  return { ...s, cursor: offsetOf(lines, line - 1, column) }
}

/** 下移一行。已经在最后一行时返回 null */
export function moveDown(s: EditState): EditState | null {
  const { line, column, lines } = position(s)
  if (line === lines.length - 1) return null
  return { ...s, cursor: offsetOf(lines, line + 1, column) }
}

/** 到当前行的行首（Home / Ctrl+A） */
export function lineStart(s: EditState): EditState {
  const { line, lines } = position(s)
  return { ...s, cursor: offsetOf(lines, line, 0) }
}

/** 到当前行的行尾（End / Ctrl+E） */
export function lineEnd(s: EditState): EditState {
  const { line, lines } = position(s)
  return { ...s, cursor: offsetOf(lines, line, lines[line]) }
}

/** 删掉光标前、同一行的所有内容（Ctrl+U，和 shell 一样） */
export function killToLineStart(s: EditState): EditState {
  const start = lineStart(s).cursor
  const c = chars(s.value)
  return { value: [...c.slice(0, start), ...c.slice(s.cursor)].join(''), cursor: start }
}
