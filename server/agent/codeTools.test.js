// applyEdit 是纯函数，不碰磁盘，最好测；第 31 章的预览测试用临时目录当工作区

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { applyEdit, previewCodeChange, runCodeTool } from './codeTools.js'

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

// ── 第 31 章：审批前预览 + 过期检查（用一个临时目录当工作区） ──────────

describe('previewCodeChange / 过期预览', () => {
  let tmp

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ws-preview-'))
    await fs.writeFile(path.join(tmp, 'math.js'), source)
    // workspaceRoot() 每次调用都读环境变量，所以测试里可以临时换掉工作区
    process.env.WORKSPACE_DIR = tmp
  })

  afterEach(async () => {
    delete process.env.WORKSPACE_DIR
    await fs.rm(tmp, { recursive: true, force: true })
  })

  const fix = {
    path: 'math.js',
    old_str: '  let total = 0\n  for (let i = 1;',
    new_str: '  let total = 0\n  for (let i = 0;',
  }

  it('edit_file：返回 diff 和文件指纹，但还没写盘', async () => {
    const plan = await previewCodeChange('edit_file', fix)
    expect(plan.ok).toBe(true)
    expect(plan.preview).toMatchObject({ path: 'math.js', additions: 1, deletions: 1 })
    expect(typeof plan.baseHash).toBe('string')
    // 只是预览，文件没变
    expect(await fs.readFile(path.join(tmp, 'math.js'), 'utf8')).toBe(source)
  })

  it('改不成的编辑在预览阶段就失败，不会去打扰用户', async () => {
    const plan = await previewCodeChange('edit_file', { ...fix, old_str: 'for (let i = 1;' })
    expect(plan.ok).toBe(false)
    expect(plan.error).toContain('2 次')
  })

  it('create_file：目标已存在时预览失败', async () => {
    const plan = await previewCodeChange('create_file', { path: 'math.js', content: 'x' })
    expect(plan.ok).toBe(false)
    expect(plan.error).toContain('已存在')
  })

  it('只读工具没有预览', async () => {
    expect(await previewCodeChange('read_file', { path: 'math.js' })).toBeNull()
  })

  it('审批期间文件被改过 → 执行时拒绝写入', async () => {
    const plan = await previewCodeChange('edit_file', fix)
    // 模拟用户在编辑器里改了文件
    await fs.writeFile(path.join(tmp, 'math.js'), '// 手动加的一行\n' + source)

    const result = await runCodeTool('edit_file', fix, { expectedHash: plan.baseHash })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('审批期间被改动过')
    expect(await fs.readFile(path.join(tmp, 'math.js'), 'utf8')).toContain('// 手动加的一行')
  })

  it('文件没变 → 正常写入', async () => {
    const plan = await previewCodeChange('edit_file', fix)
    const result = await runCodeTool('edit_file', fix, { expectedHash: plan.baseHash })
    expect(result.ok).toBe(true)
    expect(await fs.readFile(path.join(tmp, 'math.js'), 'utf8')).toContain('for (let i = 0;')
  })
})
