import { useCallback, useEffect, useState } from 'react'

/**
 * 像 useState 一样用，但值会自动同步到 localStorage。
 *
 * 泛型 T 让它能存任何可序列化的类型：
 *   const [tasks, setTasks] = useLocalStorage<Task[]>('tasks', [])
 *   const [theme, setTheme] = useLocalStorage<'light' | 'dark'>('theme', 'light')
 */
export function useLocalStorage<T>(key: string, initialValue: T) {
  // 惰性初始化：只在首次渲染读一次
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw !== null ? (JSON.parse(raw) as T) : initialValue
    } catch {
      // JSON 坏了 / 隐私模式禁用了 localStorage
      return initialValue
    }
  })

  // value 变了就写回去
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      console.warn(`写入 localStorage 失败：${key}`)
    }
  }, [key, value])

  /** 清除这个 key，并把 state 恢复成初始值 */
  const remove = useCallback(() => {
    try {
      localStorage.removeItem(key)
    } catch {
      /* 忽略 */
    }
    setValue(initialValue)
  }, [key, initialValue])

  // as const 保证解构出来的类型是 [T, Dispatch<SetStateAction<T>>, () => void]
  return [value, setValue, remove] as const
}
