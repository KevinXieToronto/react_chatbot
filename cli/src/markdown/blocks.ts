import { lexer, type Token } from 'marked'

export interface SplitResult {
  /** 已经写完的块（不会再变了） */
  finished: Token[]
  /** finished 在原文里一共占多少个字符（包括块之间的空行） */
  length: number
  /** 还在写的最后一块。closed = true 时为空 */
  open: Token[]
}

/**
 * 把一段 Markdown 切成"块"（标题、段落、列表、代码块、表格……）。
 *
 * 怎么判断一块写完了？看它后面还有没有别的东西：
 *   "段落\n\n"      → [段落, 空行]      段落后面有空行，写完了
 *   "段落\n\n下一"  → [段落, 空行, 段落] 前两个写完了，最后一个还可能继续长
 *   "```ts\ncode"   → [代码块]           代码块还没闭合，没写完
 * 规则就是：closed = false 时，除了最后一个 token，前面的都写完了。
 *
 * 例外：末尾只有"换行 + 几个空格"时，marked 也会给一个 space token，
 * 但那不是空行 —— 下一行很可能是列表的子项（"2. 第二步\n   - 嵌套"）。这时前一块也不算写完。
 *
 * 空行（space）算进 length，但不放进 finished / open —— 渲染时不需要它。
 */
export function splitBlocks(text: string, closed: boolean): SplitResult {
  const tokens = lexer(text)

  let cut = tokens.length
  if (!closed) {
    const last = tokens[tokens.length - 1]
    const onlyIndent = last?.type === 'space' && !/\n[ \t]*\n/.test(last.raw)
    cut = Math.max(0, tokens.length - (onlyIndent ? 2 : 1))
  }

  const done = tokens.slice(0, cut)
  const visible = (t: Token) => t.type !== 'space' && t.type !== 'def'
  return {
    finished: done.filter(visible),
    // 各个 token 的 raw 首尾相接正好是原文，所以可以用来算"切到了哪里"
    length: done.reduce((n, t) => n + t.raw.length, 0),
    open: tokens.slice(cut).filter(visible),
  }
}
