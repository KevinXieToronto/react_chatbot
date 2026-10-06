import { useEffect, useRef } from 'react'

interface UseKeyPressOptions {
  /** 在输入框/文本域里也触发。默认 false —— 避免劫持用户的正常输入 */
  enableInInput?: boolean
  /** 触发时阻止默认行为。默认 true */
  preventDefault?: boolean
}

/**
 * 监听全局按键。
 *
 *   useKeyPress('/', () => inputRef.current?.focus())
 *   useKeyPress('Escape', () => setOpen(false), { enableInInput: true })
 */
export function useKeyPress(
  targetKey: string,
  handler: () => void,
  options: UseKeyPressOptions = {},
) {
  const { enableInInput = false, preventDefault = true } = options

  const handlerRef = useRef(handler)
  useEffect(() => {
    handlerRef.current = handler
  })

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== targetKey) return

      if (!enableInInput) {
        const target = e.target as HTMLElement
        const isTyping =
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable
        if (isTyping) return
      }

      if (preventDefault) e.preventDefault()
      handlerRef.current()
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [targetKey, enableInInput, preventDefault])
}
