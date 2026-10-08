import { describe, expect, it } from 'vitest'
import {
  backspace,
  fromText,
  insert,
  killToLineStart,
  lineEnd,
  lineStart,
  moveDown,
  moveLeft,
  moveUp,
  position,
} from './editing'

describe('editing', () => {
  it('在光标处插入，光标跟着往后走；中文按一个字算', () => {
    const s = insert({ value: '你好', cursor: 1 }, '们')
    expect(s).toEqual({ value: '你们好', cursor: 2 })
  })

  it('emoji 也是一个字：退格不会删掉半个（肤色、国旗、ZWJ 序列也是）', () => {
    expect(backspace(fromText('ok👍'))).toEqual({ value: 'ok', cursor: 2 })
    expect(backspace(fromText('ok👍🏽'))).toEqual({ value: 'ok', cursor: 2 })
    expect(backspace(fromText('ok🇨🇦'))).toEqual({ value: 'ok', cursor: 2 })
    expect(backspace(fromText('ok👨‍👩‍👧'))).toEqual({ value: 'ok', cursor: 2 })
  })

  it('多行：算出光标在第几行第几列', () => {
    expect(position({ value: 'ab\ncde', cursor: 4 })).toMatchObject({ line: 1, column: 1 })
    expect(position({ value: 'ab\ncde', cursor: 2 })).toMatchObject({ line: 0, column: 2 })
  })

  it('上下移动保持列；第一行再往上、最后一行再往下返回 null（留给翻历史）', () => {
    const s = { value: 'abcd\nxy', cursor: 7 } // 第二行末尾
    const up = moveUp(s)!
    expect(position(up)).toMatchObject({ line: 0, column: 2 })
    expect(moveUp(up)).toBeNull()
    expect(moveDown(s)).toBeNull()
  })

  it('行首、行尾、Ctrl+U 只作用于当前行', () => {
    const s = { value: 'first\nsecond', cursor: 9 } // "sec|ond"
    expect(lineStart(s).cursor).toBe(6)
    expect(lineEnd(s).cursor).toBe(12)
    expect(killToLineStart(s)).toEqual({ value: 'first\nond', cursor: 6 })
    expect(moveLeft({ value: '', cursor: 0 }).cursor).toBe(0)
  })
})
