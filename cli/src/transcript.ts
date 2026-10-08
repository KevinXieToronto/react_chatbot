import type { Token } from 'marked'
import type { ToolCall } from '@taskflow/agent-core'
import { splitBlocks } from './markdown/blocks'

/**
 * 写进 <Static> 的一条记录。写进去就不会再变，所以每一项都必须是"已经定稿"的东西。
 * 第 35 章是一整条消息一项；这一章切得更细：一次工具调用一项、一个 Markdown 块一项。
 */
export type Entry =
  | { kind: 'header'; id: string }
  | { kind: 'user'; id: string; text: string }
  | { kind: 'tool'; id: string; call: ToolCall }
  /** lead：这段文字的第一块，前面画 ⏺，后面的块只缩进 */
  | { kind: 'block'; id: string; token: Token; lead: boolean }
  | { kind: 'notice'; id: string; tone: 'info' | 'warn' | 'error'; text: string }
  /** 一轮以工具调用结尾时补一个空行，和下一条消息隔开 */
  | { kind: 'spacer'; id: string }

/**
 * 一轮对话按"到达顺序"分成几段：文字、工具、文字……
 * turnReducer 只记"有哪些工具、一共说了什么"，不记它们谁先谁后；
 * 终端要按时间顺序一行行往下写，所以这里单独记一份顺序。
 */
export type Segment =
  /** committed：已经写进 <Static> 的字符数；blocks：已经写进去几块 */
  | { kind: 'text'; text: string; committed: number; blocks: number }
  | { kind: 'tool'; id: string }

export function addText(segments: Segment[], text: string): Segment[] {
  const last = segments.at(-1)
  if (last?.kind === 'text') {
    return [...segments.slice(0, -1), { ...last, text: last.text + text }]
  }
  return [...segments, { kind: 'text', text, committed: 0, blocks: 0 }]
}

export function addTool(segments: Segment[], id: string): Segment[] {
  return [...segments, { kind: 'tool', id }]
}

const isFinal = (call: ToolCall | undefined) =>
  call !== undefined && (call.status === 'success' || call.status === 'error')

export interface SettleResult {
  segments: Segment[]
  /** 第几段之前的内容已经全部定稿 */
  cursor: number
  /** 这次新定稿、要追加进 <Static> 的记录 */
  entries: Entry[]
}

/**
 * 从 cursor 开始往后看，把"已经定稿"的内容挑出来交给 <Static>：
 * - 工具：结束了（成功 / 失败）才算定稿；还在跑就停下，后面的内容也先不动（保证顺序）
 * - 文字：切成块，写完的块定稿；如果这段文字后面已经跟了别的段（或者整轮结束了），它的最后一块也算写完
 *
 * closed = true 表示这一轮结束了，所有东西都要定稿。
 */
export function settle(
  segments: Segment[],
  cursor: number,
  toolCalls: ToolCall[],
  closed: boolean,
  nextId: () => string,
): SettleResult {
  const next = [...segments]
  const entries: Entry[] = []
  let i = cursor

  while (i < next.length) {
    const seg = next[i]

    if (seg.kind === 'tool') {
      const call = toolCalls.find((c) => c.id === seg.id)
      if (!call || !isFinal(call)) break
      entries.push({ kind: 'tool', id: nextId(), call })
      i++
      continue
    }

    const segClosed = closed || i < next.length - 1
    const { finished, length } = splitBlocks(seg.text.slice(seg.committed), segClosed)
    let blocks = seg.blocks
    for (const token of finished) {
      entries.push({ kind: 'block', id: nextId(), token, lead: blocks === 0 })
      blocks++
    }
    next[i] = { ...seg, committed: seg.committed + length, blocks }
    if (!segClosed) break
    i++
  }

  return { segments: next, cursor: i, entries }
}

/** 动态区里要画的东西：还没定稿的工具和文字块 */
export type LiveItem =
  | { kind: 'tool'; key: string; call: ToolCall }
  | { kind: 'block'; key: string; token: Token; lead: boolean; last: boolean }

export function liveItems(segments: Segment[], cursor: number, toolCalls: ToolCall[]): LiveItem[] {
  const items: LiveItem[] = []
  segments.slice(cursor).forEach((seg, n) => {
    const index = cursor + n
    if (seg.kind === 'tool') {
      const call = toolCalls.find((c) => c.id === seg.id)
      if (call) items.push({ kind: 'tool', key: `tool-${call.id}`, call })
      return
    }
    // 还没定稿的尾巴：通常就是正在写的那一块（最多再加上被前面的工具"挡住"的几块）
    const { finished } = splitBlocks(seg.text.slice(seg.committed), true)
    finished.forEach((token, k) => {
      items.push({
        kind: 'block',
        key: `block-${index}-${seg.blocks + k}`,
        token,
        lead: seg.blocks + k === 0,
        last: index === segments.length - 1 && k === finished.length - 1,
      })
    })
  })
  return items
}
