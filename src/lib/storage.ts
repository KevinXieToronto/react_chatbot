import type { Task } from '../types/task'

const STORAGE_KEY = 'taskflow:tasks'

/** 从 localStorage 读任务。读不到或坏了就返回 null，由调用方决定 fallback。 */
export function loadTasks(): Task[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null

    const parsed: unknown = JSON.parse(raw)
    // 最基本的校验：必须是数组。真实项目应该用 Zod 做完整校验（第 17 章）
    if (!Array.isArray(parsed)) return null

    return parsed as Task[]
  } catch {
    // JSON 坏了、localStorage 被禁用（隐私模式）都会走到这
    console.warn('读取本地任务失败，使用默认数据')
    return null
  }
}

/** 写入 localStorage。失败不影响主流程。 */
export function saveTasks(tasks: Task[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
  } catch {
    // 配额满了或被禁用
    console.warn('保存本地任务失败')
  }
}
