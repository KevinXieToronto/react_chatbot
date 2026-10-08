import { describe, expect, it } from 'vitest'
import type { ToolCall } from '@taskflow/agent-core'
import { addText, addTool, liveItems, settle, type Segment } from './transcript'

let n = 0
const nextId = () => `id${++n}`

const call = (id: string, status: ToolCall['status']): ToolCall => ({
  id,
  name: 'list_tasks',
  input: {},
  status,
})

describe('settle：挑出已经定稿的内容', () => {
  it('文字：写完的块先定稿，最后一块留在动态区', () => {
    const r = settle(addText([], '第一段\n\n第二段写到一'), 0, [], false, nextId)
    expect(r.entries.map((e) => e.kind)).toEqual(['block'])
    expect(r.entries[0]).toMatchObject({ lead: true })
    expect(liveItems(r.segments, r.cursor, []).map((i) => i.kind)).toEqual(['block'])

    // 再来几个字，第二段写完了；它不是这段文字的第一块，不画 ⏺
    const r2 = settle(addText(r.segments, '半\n\n第三'), r.cursor, [], false, nextId)
    expect(r2.entries).toHaveLength(1)
    expect(r2.entries[0]).toMatchObject({ kind: 'block', lead: false })
  })

  it('工具还在跑时停下，保证 <Static> 里的顺序和到达顺序一致', () => {
    let segs: Segment[] = addText([], '我先查一下。\n\n')
    segs = addTool(segs, 't1')
    segs = addText(segs, '查到了')

    const running = settle(segs, 0, [call('t1', 'running')], false, nextId)
    expect(running.entries.map((e) => e.kind)).toEqual(['block'])
    expect(running.cursor).toBe(1) // 停在工具那一段

    const done = settle(running.segments, running.cursor, [call('t1', 'success')], false, nextId)
    expect(done.entries.map((e) => e.kind)).toEqual(['tool'])
    expect(done.cursor).toBe(2) // "查到了"还在写
  })

  it('整轮结束（closed）：最后一块也定稿，动态区清空', () => {
    const r = settle(addText([], '只有一段'), 0, [], true, nextId)
    expect(r.entries.map((e) => e.kind)).toEqual(['block'])
    expect(r.cursor).toBe(1)
    expect(liveItems(r.segments, r.cursor, [])).toEqual([])
  })
})
