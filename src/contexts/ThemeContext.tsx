import { createContext, use, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocalStorage } from '../hooks/useLocalStorage'

/** system = 跟随操作系统设置 */
export type ThemeMode = 'light' | 'dark' | 'system'

interface ThemeContextValue {
  /** 用户选的模式 */
  mode: ThemeMode
  /** 实际生效的主题（system 会被解析成 light 或 dark） */
  resolved: 'light' | 'dark'
  setMode: (mode: ThemeMode) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function getSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // 用户选的模式要持久化
  const [mode, setMode] = useLocalStorage<ThemeMode>('taskflow:theme', 'system')

  // 系统主题不需要持久化（每次都能从系统读到），用普通 state + 惰性初始化
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(getSystemTheme)

  // 监听系统主题变化（外部系统 → 典型的 useEffect 场景）
  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)')

    function onChange(e: MediaQueryListEvent) {
      setSystemTheme(e.matches ? 'dark' : 'light')
    }

    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  const resolved = mode === 'system' ? systemTheme : mode

  // 把 class 加到 <html> 上，Tailwind 的 dark: 才会生效
  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark')
  }, [resolved])

  // ⚠️ 必须 useMemo，否则每次渲染 value 都是新对象，所有消费者全部重渲染
  const value = useMemo<ThemeContextValue>(
    () => ({ mode, resolved, setMode }),
    [mode, resolved, setMode],
  )

  return <ThemeContext value={value}>{children}</ThemeContext>
}

/** 配套的自定义 Hook：类型安全 + 忘记包 Provider 时报错信息清楚 */
export function useTheme() {
  const ctx = use(ThemeContext)
  if (!ctx) throw new Error('useTheme 必须在 <ThemeProvider> 内部使用')
  return ctx
}
