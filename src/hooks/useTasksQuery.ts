import { useCallback, useEffect, useRef, useState } from 'react'
import { taskApi } from '../api/taskApi'
import { ApiError } from '../lib/http'
import type { Task } from '../types/task'

export function useTasksQuery() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 用来标记组件是否还挂载着，避免卸载后 setState
  const mountedRef = useRef(true)

  const fetchTasks = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await taskApi.list(signal)
      if (!mountedRef.current) return
      setTasks(data)
    } catch (err) {
      if (!mountedRef.current) return
      // 主动取消不算错误
      if (err instanceof Error && err.name === 'CanceledError') return
      setError(err instanceof ApiError ? err.message : '加载失败')
    } finally {
      if (mountedRef.current) setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    const controller = new AbortController()
    void fetchTasks(controller.signal)

    return () => {
      mountedRef.current = false
      controller.abort() // 组件卸载时取消进行中的请求
    }
  }, [fetchTasks])

  return { tasks, setTasks, isLoading, error, refetch: () => fetchTasks() }
}
