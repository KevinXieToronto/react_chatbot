import { useEffect, useReducer } from 'react'
import { taskReducer } from './taskReducer'
import { mockTasks } from '../../data/mockTasks'
import type { Task } from '../../types/task'

const STORAGE_KEY = 'taskflow:tasks'

function loadInitial(): Task[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return mockTasks
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Task[]) : mockTasks
  } catch {
    return mockTasks
  }
}

/**
 * 任务状态 + 持久化。
 * useReducer 的第三个参数是"惰性初始化函数"，只在首次渲染调用一次，
 * 和 useState(() => ...) 是一个意思。
 */
export function useTasks() {
  const [tasks, dispatch] = useReducer(taskReducer, null, loadInitial)

  // 持久化作为副作用放在这里，而不是塞进 reducer —— reducer 必须保持纯净
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
    } catch {
      console.warn('保存任务失败')
    }
  }, [tasks])

  // dispatch 的引用永远不变，所以返回的这个对象里它是稳定的
  return { tasks, dispatch }
}
