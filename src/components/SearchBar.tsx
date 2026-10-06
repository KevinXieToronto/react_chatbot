import { useRef } from 'react'
import { useKeyPress } from '../hooks/useKeyPress'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  /** 正在防抖等待中，用来给用户一点反馈 */
  pending?: boolean
}

export default function SearchBar({ value, onChange, pending = false }: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  // "/" 聚焦搜索框（在输入框里不触发）
  useKeyPress('/', () => inputRef.current?.focus())

  // Esc 清空并失焦（需要在输入框里也生效，所以 enableInInput）
  useKeyPress(
    'Escape',
    () => {
      if (document.activeElement !== inputRef.current) return
      onChange('')
      inputRef.current?.blur()
    },
    { enableInInput: true, preventDefault: false },
  )

  return (
    <div className="relative mb-4">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="搜索任务…"
        className="w-full rounded-md border border-slate-300 bg-white py-2 pl-3 pr-20 text-sm outline-none focus:border-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
      />

      <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
        {pending && <span className="text-xs text-slate-400">…</span>}
        {value ? (
          <button
            type="button"
            onClick={() => {
              onChange('')
              inputRef.current?.focus()
            }}
            className="rounded px-2 py-0.5 text-xs text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-600"
          >
            清除
          </button>
        ) : (
          <kbd className="pointer-events-none rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-xs text-slate-400 dark:border-slate-600 dark:bg-slate-800">
            /
          </kbd>
        )}
      </div>
    </div>
  )
}
