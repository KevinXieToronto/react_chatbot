import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { addEntry, loadHistory, saveHistory } from './history'

const tempFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'taskflow-')), 'sub', 'history.json')

describe('history', () => {
  it('存了再读回来；目录不存在会自动建', () => {
    const file = tempFile()
    saveHistory(file, ['a', 'b'])
    expect(loadHistory(file)).toEqual(['a', 'b'])
  })

  it('文件不存在、内容坏了：当成没有历史，不抛异常', () => {
    const file = tempFile()
    expect(loadHistory(file)).toEqual([])
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, '{ 坏掉的 JSON')
    expect(loadHistory(file)).toEqual([])
  })

  it('连续重复的不记；空白不记；最多 200 条', () => {
    expect(addEntry(['a'], 'a')).toEqual(['a'])
    expect(addEntry(['a'], '  ')).toEqual(['a'])
    const many = Array.from({ length: 200 }, (_, i) => String(i))
    const next = addEntry(many, 'new')
    expect(next).toHaveLength(200)
    expect(next[0]).toBe('1')
    expect(next.at(-1)).toBe('new')
  })
})
