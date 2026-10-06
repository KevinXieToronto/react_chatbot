import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { mockTasks } from '../data/mockTasks'
import type { Task, TaskDraft } from '../types/task'

interface TaskState {
  tasks: Task[]
}

interface TaskActions {
  addTask: (draft: TaskDraft) => void
  updateTask: (id: string, draft: TaskDraft) => void
  deleteTask: (id: string) => void
  toggleTask: (id: string) => void
  completeAll: () => void
  clearCompleted: () => void
  resetTasks: () => void
}

export const useTaskStore = create<TaskState & TaskActions>()(
  persist(
    (set) => ({
      tasks: mockTasks,

      // 注意这里可以调 crypto.randomUUID()：
      // Zustand 的 action 是普通函数，不是 reducer，没有"必须纯函数"的约束。
      // 这是它比 useReducer 方便的地方之一。
      addTask: (draft) =>
        set((state) => ({
          tasks: [
            { ...draft, id: crypto.randomUUID(), createdAt: new Date().toISOString() },
            ...state.tasks,
          ],
        })),

      updateTask: (id, draft) =>
        set((state) => ({
          tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...draft } : t)),
        })),

      deleteTask: (id) =>
        set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) })),

      toggleTask: (id) =>
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id ? { ...t, status: t.status === 'done' ? 'todo' : 'done' } : t,
          ),
        })),

      completeAll: () =>
        set((state) => ({
          // 已完成的直接返回原对象，保持引用 → memo 能跳过那些卡片
          tasks: state.tasks.map((t) => (t.status === 'done' ? t : { ...t, status: 'done' })),
        })),

      clearCompleted: () =>
        set((state) => ({ tasks: state.tasks.filter((t) => t.status !== 'done') })),

      resetTasks: () => set({ tasks: mockTasks }),
    }),
    {
      // ⚠️ 不能叫 'taskflow:tasks'：第 07–11 章用这个 key 存的是一个裸数组，
      // persist 期望的是 { state, version } 这种带包装的格式，读到裸数组会当成"没有数据"，
      // 然后用示例数据覆盖掉你原来的任务。换个新名字，旧数据留在旧 key 里不受影响。
      name: 'taskflow:task-store',
      version: 1,
      // 只持久化数据，不持久化函数（函数本来也存不进 JSON）
      partialize: (state) => ({ tasks: state.tasks }),
    },
  ),
)
