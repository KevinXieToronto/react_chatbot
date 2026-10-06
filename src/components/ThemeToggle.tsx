import { useTheme } from '../contexts/ThemeContext'
import type { ThemeMode } from '../contexts/ThemeContext'

const MODES: { value: ThemeMode; icon: string; label: string }[] = [
  { value: 'light', icon: '☀', label: '浅色' },
  { value: 'dark', icon: '☾', label: '暗色' },
  { value: 'system', icon: '🖥', label: '跟随系统' },
]

export default function ThemeToggle() {
  const { mode, setMode } = useTheme()

  return (
    <div className="flex items-center gap-0.5 rounded-md border border-slate-200 p-0.5 dark:border-slate-700">
      {MODES.map((m) => (
        <button
          key={m.value}
          type="button"
          title={m.label}
          aria-label={m.label}
          aria-pressed={mode === m.value}
          onClick={() => setMode(m.value)}
          className={
            mode === m.value
              ? 'rounded px-2 py-1 text-sm bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200'
              : 'rounded px-2 py-1 text-sm text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }
        >
          {m.icon}
        </button>
      ))}
    </div>
  )
}
