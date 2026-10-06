import { http, ApiError } from '../lib/http'
import { TaskSchema, TaskListSchema } from '../types/schemas'
import type { Task, TaskDraft } from '../types/task'

/**
 * 用 Zod 校验后端返回的数据。
 * 为什么必须做：TS 的类型在运行时完全不存在，后端返回什么就是什么。
 * 与其让脏数据流进 UI 层在某个奇怪的地方崩掉，不如在入口就拦住并给出清楚的错误。
 */
function parseOrThrow<T>(schema: { safeParse: (d: unknown) => { success: boolean; data?: T; error?: unknown } }, data: unknown, what: string): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    console.error(`[API] ${what} 数据格式不符合预期：`, result.error)
    throw new ApiError(`服务端返回的${what}格式有误`, 0)
  }
  return result.data as T
}

export const taskApi = {
  async list(signal?: AbortSignal): Promise<Task[]> {
    const res = await http.get('/tasks', { signal })
    return parseOrThrow<Task[]>(TaskListSchema, res.data, '任务列表')
  },

  async get(id: string, signal?: AbortSignal): Promise<Task> {
    const res = await http.get(`/tasks/${id}`, { signal })
    return parseOrThrow<Task>(TaskSchema, res.data, '任务')
  },

  async create(draft: TaskDraft): Promise<Task> {
    const res = await http.post('/tasks', {
      ...draft,
      createdAt: new Date().toISOString(),
    })
    return parseOrThrow<Task>(TaskSchema, res.data, '任务')
  },

  async update(id: string, patch: Partial<Task>): Promise<Task> {
    const res = await http.patch(`/tasks/${id}`, patch)
    return parseOrThrow<Task>(TaskSchema, res.data, '任务')
  },

  async remove(id: string): Promise<void> {
    await http.delete(`/tasks/${id}`)
  },
}
