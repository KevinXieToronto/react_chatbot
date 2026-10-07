import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

/** 默认工作区：项目根目录下的 workspace/ */
const DEFAULT_ROOT = path.join(here, '..', '..', 'workspace')

/** 单个文件最多读多少字节。再大的文件对模型来说也读不完，只会烧 token */
export const MAX_FILE_BYTES = 256 * 1024

/** 列目录 / 搜索时跳过的目录 */
const IGNORED_DIRS = new Set(['.git', 'node_modules'])

/**
 * 带 HTTP 状态码的错误。路由里可以直接用 err.status 回给前端，
 * 工具里可以直接用 err.message 回给模型。
 */
export class WorkspaceError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.name = 'WorkspaceError'
    this.status = status
  }
}

/**
 * 工作区根目录（绝对路径）。
 *
 * 写成函数而不是模块顶层常量：每次用的时候再读 process.env。
 * 第 21 章的 env.js 已经保证 server/.env 先于所有业务模块加载，顶层读也读得到；
 * 写成函数的好处是不依赖这个顺序，测试里临时改 WORKSPACE_DIR 也能立刻生效。
 */
export function workspaceRoot() {
  return path.resolve(process.env.WORKSPACE_DIR || DEFAULT_ROOT)
}

/** target 是不是在 root 里面（或者就是 root 本身） */
export function isInside(root, target) {
  const rel = path.relative(root, target)
  if (rel === '') return true
  // 跨盘符时 path.relative 会直接返回 target 的绝对路径
  if (path.isAbsolute(rel)) return false
  return rel !== '..' && !rel.startsWith('..' + path.sep)
}

/**
 * 第一关：纯字符串检查，不碰磁盘。
 * 挡住绝对路径、盘符、NUL 字符、以及 `..` 跳出工作区。
 */
export function resolveLexical(root, relPath) {
  if (typeof relPath !== 'string' || relPath.trim() === '') {
    throw new WorkspaceError('缺少路径')
  }
  if (relPath.includes('\0')) {
    throw new WorkspaceError('路径里有非法字符')
  }
  // C:\xxx、C:xxx、\xxx、/xxx 统统拒绝
  if (path.isAbsolute(relPath) || /^[a-zA-Z]:/.test(relPath)) {
    throw new WorkspaceError('只能用相对于工作区的路径，不能用绝对路径')
  }
  // 冒号在 Windows 上还能写出 NTFS "备用数据流"（file.txt:secret），一并拒绝
  if (relPath.includes(':')) {
    throw new WorkspaceError('路径里不能有冒号')
  }

  const abs = path.resolve(root, relPath)
  if (!isInside(root, abs)) {
    throw new WorkspaceError('路径越界：不允许访问工作区以外的文件')
  }
  return abs
}

/**
 * 第二关：顺着符号链接 / 目录联接（junction）找到真实位置，再检查一次。
 *
 * 光看字符串不够：workspace/leak 如果是一个指向 C:\ 的联接，
 * "workspace/leak/Windows/win.ini" 在字符串上完全合法，真实位置却在外面。
 *
 * 文件可能还不存在（create_file 要新建），那就往上找到第一个存在的祖先目录检查。
 */
export async function resolveInWorkspace(relPath, root = workspaceRoot()) {
  const abs = resolveLexical(root, relPath)
  const realRoot = await fs.realpath(root).catch(() => {
    throw new WorkspaceError('工作区目录不存在，请先在项目根目录建 workspace 文件夹', 500)
  })

  let probe = abs
  while (true) {
    try {
      const real = await fs.realpath(probe)
      if (!isInside(realRoot, real)) {
        throw new WorkspaceError('路径越界：这个路径通过链接指向了工作区以外')
      }
      return abs
    } catch (err) {
      if (err instanceof WorkspaceError) throw err
      if (err.code !== 'ENOENT') throw err
      const parent = path.dirname(probe)
      if (parent === probe) return abs
      probe = parent
    }
  }
}

/** 绝对路径 → 给模型和前端看的相对路径（统一用 /） */
export function toRel(abs, root = workspaceRoot()) {
  return path.relative(root, abs).split(path.sep).join('/')
}

/** 含 NUL 字节基本就是二进制文件，不该当文本读给模型 */
export function isBinary(buf) {
  return buf.subarray(0, 8000).includes(0)
}

/** 安全地读一个文本文件 */
export async function readTextFile(relPath, root = workspaceRoot()) {
  const abs = await resolveInWorkspace(relPath, root)

  let stat
  try {
    stat = await fs.stat(abs)
  } catch (err) {
    if (err.code === 'ENOENT') throw new WorkspaceError(`文件不存在：${relPath}`, 404)
    throw err
  }
  if (!stat.isFile()) throw new WorkspaceError(`不是文件：${relPath}`)
  if (stat.size > MAX_FILE_BYTES) {
    throw new WorkspaceError(`文件太大（${Math.round(stat.size / 1024)} KB），超过 256 KB 上限`, 413)
  }

  const buf = await fs.readFile(abs)
  if (isBinary(buf)) throw new WorkspaceError(`这是二进制文件，不能按文本读取：${relPath}`, 415)

  return { abs, content: buf.toString('utf8'), size: stat.size }
}

/**
 * 递归列出目录下的所有文件。
 * 跳过 .git / node_modules，也【不跟随】符号链接 —— 否则一个指向外面的链接
 * 就能把整个磁盘列出来。
 */
export async function listWorkspaceFiles(relDir = '.', { limit = 500, root = workspaceRoot() } = {}) {
  const start = await resolveInWorkspace(relDir, root)
  const files = []
  let truncated = false

  async function walk(dir) {
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch (err) {
      if (err.code === 'ENOENT') throw new WorkspaceError(`目录不存在：${relDir}`, 404)
      if (err.code === 'ENOTDIR') throw new WorkspaceError(`不是目录：${relDir}`)
      throw err
    }
    entries.sort((a, b) => a.name.localeCompare(b.name))

    for (const entry of entries) {
      if (files.length >= limit) {
        truncated = true
        return
      }
      if (entry.isSymbolicLink()) continue
      const abs = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) await walk(abs)
      } else if (entry.isFile()) {
        const { size } = await fs.stat(abs)
        files.push({ path: toRel(abs, root), size })
      }
    }
  }

  await walk(start)
  return { files, truncated }
}
