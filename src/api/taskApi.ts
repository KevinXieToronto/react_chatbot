import { http } from '../lib/http'
import type { Task, TaskDraft } from '../types/task'

/**
 * 所有跟任务相关的 HTTP 调用都收在这里。
 * 好处：
 * - 组件不用关心 URL 和请求细节
 * - 后端接口变了只改这一个文件
 * - 测试时容易 mock
 */
export const taskApi = {
  async list(signal?: AbortSignal): Promise<Task[]> {
    const res = await http.get<Task[]>('/tasks', { signal })
    return res.data
  },

  async get(id: string, signal?: AbortSignal): Promise<Task> {
    const res = await http.get<Task>(`/tasks/${id}`, { signal })
    return res.data
  },

  async create(draft: TaskDraft): Promise<Task> {
    // id 交给服务端生成；createdAt 由前端给（服务端也可以给，看约定）
    const res = await http.post<Task>('/tasks', {
      ...draft,
      createdAt: new Date().toISOString(),
    })
    return res.data
  },

  async update(id: string, patch: Partial<Task>): Promise<Task> {
    // PATCH 是局部更新，只传要改的字段
    const res = await http.patch<Task>(`/tasks/${id}`, patch)
    return res.data
  },

  async remove(id: string): Promise<void> {
    await http.delete(`/tasks/${id}`)
  },
}
