import { useEffect, useRef } from 'react'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
}

export default function SearchBar({ value, onChange }: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // 已经在输入框里时不劫持 "/"，否则用户没法输入这个字符
      const target = e.target as HTMLElement
      const isTyping =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable

      if (e.key === '/' && !isTyping) {
        e.preventDefault() // 阻止 "/" 被输入进去
        inputRef.current?.focus()
      }

      if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        onChange('')
        inputRef.current?.blur()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onChange])

  return (
    <div className="relative mb-4">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="搜索任务…"
        className="w-full rounded-md border border-slate-300 bg-white py-2 pl-3 pr-16 text-sm outline-none focus:border-blue-500"
      />
      {/* 有内容显示清除按钮，没内容显示快捷键提示 */}
      {value ? (
        <button
          type="button"
          onClick={() => {
            onChange('')
            inputRef.current?.focus() // 清空后把焦点还给输入框
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-0.5 text-xs text-slate-400 hover:bg-slate-100"
        >
          清除
        </button>
      ) : (
        <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-xs text-slate-400">
          /
        </kbd>
      )}
    </div>
  )
}
