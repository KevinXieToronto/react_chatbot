import { useEffect, useRef } from 'react'

/**
 * 点击元素外部时触发回调。返回要绑定到元素上的 ref。
 *
 *   const ref = useClickOutside<HTMLDivElement>(() => setOpen(false), open)
 *   <div ref={ref}>…</div>
 *
 * @param handler 点击外部时调用
 * @param enabled 为 false 时不监听（菜单关着就不用监听，省性能）
 */
export function useClickOutside<T extends HTMLElement>(
  handler: () => void,
  enabled = true,
) {
  const ref = useRef<T>(null)

  // 把 handler 存进 ref：这样即使调用方传的是每次渲染都新建的箭头函数，
  // effect 也不会因为依赖变化而反复重新注册监听器。
  const handlerRef = useRef(handler)
  useEffect(() => {
    handlerRef.current = handler
  })

  useEffect(() => {
    if (!enabled) return

    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        handlerRef.current()
      }
    }

    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [enabled])

  return ref
}
