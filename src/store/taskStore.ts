import { create } from 'zustand'
import { taskApi } from '../api/taskApi'
import { ApiError } from '../lib/http'
import type { Task, TaskDraft } from '../types/task'

interface TaskState {
  tasks: Task[]
  isLoading: boolean
  error: string | null
  /** 正在提交中的操作数量，用来禁用按钮 */
  pendingCount: number
}

interface TaskActions {
  fetchTasks: () => Promise<void>
  addTask: (draft: TaskDraft) => Promise<void>
  updateTask: (id: string, draft: TaskDraft) => Promise<void>
  deleteTask: (id: string) => Promise<void>
  toggleTask: (id: string) => Promise<void>
  completeAll: () => Promise<void>
  clearCompleted: () => Promise<void>
}

function toMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : '操作失败，请重试'
}

export const useTaskStore = create<TaskState & TaskActions>((set, get) => ({
  tasks: [],
  isLoading: true,
  error: null,
  pendingCount: 0,

  fetchTasks: async () => {
    set({ isLoading: true, error: null })
    try {
      const tasks = await taskApi.list()
      set({ tasks, isLoading: false })
    } catch (err) {
      set({ error: toMessage(err), isLoading: false })
    }
  },

  addTask: async (draft) => {
    set((s) => ({ pendingCount: s.pendingCount + 1 }))
    try {
      const created = await taskApi.create(draft)
      // 服务端返回了带真实 id 的完整对象，用它更新本地
      set((s) => ({ tasks: [created, ...s.tasks], error: null }))
    } catch (err) {
      set({ error: toMessage(err) })
    } finally {
      set((s) => ({ pendingCount: s.pendingCount - 1 }))
    }
  },

  updateTask: async (id, draft) => {
    set((s) => ({ pendingCount: s.pendingCount + 1 }))
    try {
      const updated = await taskApi.update(id, draft)
      set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? updated : t)), error: null }))
    } catch (err) {
      set({ error: toMessage(err) })
    } finally {
      set((s) => ({ pendingCount: s.pendingCount - 1 }))
    }
  },

  deleteTask: async (id) => {
    set((s) => ({ pendingCount: s.pendingCount + 1 }))
    try {
      await taskApi.remove(id)
      set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id), error: null }))
    } catch (err) {
      set({ error: toMessage(err) })
    } finally {
      set((s) => ({ pendingCount: s.pendingCount - 1 }))
    }
  },

  toggleTask: async (id) => {
    const task = get().tasks.find((t) => t.id === id)
    if (!task) return
    const nextStatus = task.status === 'done' ? 'todo' : 'done'

    // 乐观更新：先改本地，让界面立刻响应
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, status: nextStatus } : t)) }))

    try {
      await taskApi.update(id, { status: nextStatus })
    } catch (err) {
      // 失败就回滚 —— 这段手写回滚逻辑很容易写错，第 16 章会看到更好的做法
      set((s) => ({
        tasks: s.tasks.map((t) => (t.id === id ? { ...t, status: task.status } : t)),
        error: toMessage(err),
      }))
    }
  },

  completeAll: async () => {
    const pending = get().tasks.filter((t) => t.status !== 'done')
    set((s) => ({ pendingCount: s.pendingCount + 1 }))
    try {
      // Promise.all 并发发请求，比一个个 await 快得多
      await Promise.all(pending.map((t) => taskApi.update(t.id, { status: 'done' })))
      await get().fetchTasks()
    } catch (err) {
      set({ error: toMessage(err) })
    } finally {
      set((s) => ({ pendingCount: s.pendingCount - 1 }))
    }
  },

  clearCompleted: async () => {
    const done = get().tasks.filter((t) => t.status === 'done')
    set((s) => ({ pendingCount: s.pendingCount + 1 }))
    try {
      await Promise.all(done.map((t) => taskApi.remove(t.id)))
      set((s) => ({ tasks: s.tasks.filter((t) => t.status !== 'done'), error: null }))
    } catch (err) {
      set({ error: toMessage(err) })
    } finally {
      set((s) => ({ pendingCount: s.pendingCount - 1 }))
    }
  },
}))
