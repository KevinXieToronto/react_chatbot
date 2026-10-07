// 服务端代码的测试。Vitest 默认环境是第 19 章配的 jsdom，
// 但 node:fs、node:path 这些 Node API 在里面照样能用，所以不需要单独配置。

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { resolveInWorkspace, resolveLexical, isInside } from './workspace.js'

describe('isInside', () => {
  const root = path.resolve('/ws')

  it('根目录本身和子路径算在里面', () => {
    expect(isInside(root, root)).toBe(true)
    expect(isInside(root, path.join(root, 'src', 'a.js'))).toBe(true)
  })

  it('父目录、兄弟目录不算', () => {
    expect(isInside(root, path.resolve('/'))).toBe(false)
    expect(isInside(root, path.resolve('/ws-evil/a.js'))).toBe(false)
  })

  it('名字以 .. 开头的普通文件不会被误判', () => {
    expect(isInside(root, path.join(root, '..foo'))).toBe(true)
  })
})

describe('resolveLexical', () => {
  const root = path.resolve('/ws')

  it('正常的相对路径', () => {
    expect(resolveLexical(root, 'src/math.js')).toBe(path.join(root, 'src', 'math.js'))
  })

  it.each([
    ['../server/.env', '越界'],
    ['src/../../package.json', '越界'],
    ['src\\..\\..\\package.json', '越界'],
    ['/etc/passwd', '绝对路径'],
    ['C:\\Windows\\win.ini', '绝对路径'],
    ['C:foo', '绝对路径'],
    ['README.md:secret', '冒号'],
    ['', '缺少路径'],
  ])('拒绝 %s', (input, reason) => {
    expect(() => resolveLexical(root, input)).toThrow(reason)
  })
})

describe('resolveInWorkspace（真实磁盘）', () => {
  let tmp, root, outside

  beforeAll(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ws-test-'))
    root = path.join(tmp, 'workspace')
    outside = path.join(tmp, 'secret')
    await fs.mkdir(path.join(root, 'src'), { recursive: true })
    await fs.mkdir(outside)
    await fs.writeFile(path.join(outside, 'key.txt'), 'sk-ant-xxx')
    // Windows 上用 junction（目录联接），不需要管理员权限；其他系统就是普通符号链接
    await fs.symlink(outside, path.join(root, 'leak'), 'junction')
  })

  afterAll(async () => {
    await fs.rm(tmp, { recursive: true, force: true })
  })

  it('还不存在的文件也能通过（create_file 要用）', async () => {
    await expect(resolveInWorkspace('src/new/file.js', root)).resolves.toBe(
      path.join(root, 'src', 'new', 'file.js'),
    )
  })

  it('字符串合法、但经过链接跑到外面的路径被拒绝', async () => {
    await expect(resolveInWorkspace('leak/key.txt', root)).rejects.toThrow('链接')
  })

  it('链接后面再接一个不存在的文件，同样被拒绝', async () => {
    await expect(resolveInWorkspace('leak/new.txt', root)).rejects.toThrow('链接')
  })
})
