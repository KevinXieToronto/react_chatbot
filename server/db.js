import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// ESM 里没有 __dirname，要从 import.meta.url 推导
const here = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.join(here, 'db.json')

const SEED = {
  tasks: [
    {
      id: '1',
      title: '写本周周报',
      description: '汇总本周进度，周五下班前发给主管',
      priority: 'high',
      status: 'doing',
      createdAt: '2026-09-15T01:20:00.000Z',
    },
    {
      id: '2',
      title: '修复登录页样式问题',
      description: '移动端下按钮溢出容器',
      priority: 'medium',
      status: 'todo',
      createdAt: '2026-09-16T06:00:00.000Z',
    },
    {
      id: '3',
      title: '整理会议纪要',
      description: '',
      priority: 'low',
      status: 'done',
      createdAt: '2026-09-14T09:45:00.000Z',
    },
  ],
}

let cache = null

// 简单的写队列：保证并发写不会互相覆盖。
// 真实项目请用数据库，这里只是让教程能跑。
let writeChain = Promise.resolve()

export async function readDb() {
  if (cache) return cache
  if (!existsSync(DB_PATH)) {
    cache = structuredClone(SEED)
    await persist()
    return cache
  }
  const raw = await readFile(DB_PATH, 'utf8')
  cache = JSON.parse(raw)
  return cache
}

function persist() {
  writeChain = writeChain.then(() => writeFile(DB_PATH, JSON.stringify(cache, null, 2), 'utf8'))
  return writeChain
}

export async function mutate(fn) {
  const db = await readDb()
  const result = fn(db)
  await persist()
  return result
}

export function newId() {
  return crypto.randomUUID()
}
