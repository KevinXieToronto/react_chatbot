// 纯函数 applyEdit 的测试：不碰磁盘，最好测

import { describe, it, expect } from 'vitest'
import { applyEdit } from './codeTools.js'

const source = [
  'export function sum(nums) {',
  '  let total = 0',
  '  for (let i = 1; i < nums.length; i++) {',
  '    total += nums[i]',
  '  }',
  '  return total',
  '}',
  '',
  'export function max(nums) {',
  '  let result = nums[0]',
  '  for (let i = 1; i < nums.length; i++) {',
  '    if (nums[i] > result) result = nums[i]',
  '  }',
  '  return result',
  '}',
  '',
].join('\n')

describe('applyEdit', () => {
  it('唯一匹配时替换，并返回所在行号', () => {
    const r = applyEdit(source, 'return total', 'return total * 1')
    expect(r.ok).toBe(true)
    expect(r.content).toContain('return total * 1')
    expect(r.line).toBe(6)
  })

  it('匹配 0 处时报错，提示先 read_file', () => {
    const r = applyEdit(source, 'return totl', 'x')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('没找到')
  })

  it('匹配多处时报错，并指出是哪几行', () => {
    const r = applyEdit(source, 'for (let i = 1; i < nums.length; i++) {', 'x')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('2 次')
    expect(r.error).toContain('第 3、11 行')
  })

  it('带上下文后匹配变唯一', () => {
    const r = applyEdit(
      source,
      '  let total = 0\n  for (let i = 1;',
      '  let total = 0\n  for (let i = 0;',
    )
    expect(r.ok).toBe(true)
    expect(r.content).toContain('for (let i = 0;')
    // max 里的那一行没被误改
    expect(r.content).toContain('let result = nums[0]\n  for (let i = 1;')
  })

  it('new_str 里的 $& 按字面写入（没有用 String.replace）', () => {
    const r = applyEdit(source, 'return total', "return '$&'")
    expect(r.ok).toBe(true)
    expect(r.content).toContain("return '$&'")
  })

  it('CRLF 文件：用 \\n 写的 old_str 也能匹配，写回后保持 CRLF', () => {
    const crlf = source.replace(/\n/g, '\r\n')
    const r = applyEdit(crlf, '  let total = 0\n  for (let i = 1;', '  let total = 0\n  for (let i = 0;')
    expect(r.ok).toBe(true)
    expect(r.content).toContain('let total = 0\r\n  for (let i = 0;')
    expect(r.content.includes('\r\n')).toBe(true)
    expect(/[^\r]\n/.test(r.content)).toBe(false)
  })

  it('old_str 为空或与 new_str 相同时报错', () => {
    expect(applyEdit(source, '', 'x').ok).toBe(false)
    expect(applyEdit(source, 'return total', 'return total').ok).toBe(false)
  })
})
