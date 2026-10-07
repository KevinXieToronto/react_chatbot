import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

/** 距离底部多少像素内算"贴着底"。不能设 0 —— 子像素误差会让它永远判断失败 */
const BOTTOM_THRESHOLD = 50

interface UseAutoScrollOptions {
  /** 这个值变化时尝试滚底（通常传消息数组或正在流式的文本） */
  dep: unknown
  /** 是否启用 */
  enabled?: boolean
}

export function useAutoScroll<T extends HTMLElement>({
  dep,
  enabled = true,
}: UseAutoScrollOptions) {
  const containerRef = useRef<T>(null)

  /**
   * 是否"跟随底部"。
   * ⚠️ 用 ref 不用 state：下面的 useLayoutEffect 必须读到用户【最新】的意图。
   *    放在 state 里的话，用户刚往上滑、新的渲染还没发生，流式输出的下一次提交
   *    就会读到旧的 true，把用户拽回底部。
   */
  const followRef = useRef(true)
  /** 上一次 scroll 事件时的 scrollTop，用来判断滚动方向 */
  const lastTopRef = useRef(0)
  /** 不贴底时是否有新内容（用来显示未读提示）。要显示在界面上，所以是 state */
  const [hasNew, setHasNew] = useState(false)

  const isAtBottom = useCallback(() => {
    const el = containerRef.current
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD
  }, [])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const el = containerRef.current
    if (!el) return
    followRef.current = true
    setHasNew(false)
    // 直接定位到 scrollHeight，比 scrollIntoView 快，而且不会带动祖先容器
    el.scrollTo({ top: el.scrollHeight, behavior })
  }, [])

  // 监听滚动：只有"往上滚并离开底部"才算用户想看历史
  useEffect(() => {
    const el = containerRef.current
    if (!el || !enabled) return
    lastTopRef.current = el.scrollTop

    function onScroll() {
      const el = containerRef.current
      if (!el) return
      const top = el.scrollTop

      if (isAtBottom()) {
        // 回到底部了（不管是谁滚的）：恢复跟随
        followRef.current = true
        setHasNew(false)
      } else if (top < lastTopRef.current) {
        // 往上滚了，而且不在底部 —— 程序只会往下滚，这只能是用户
        followRef.current = false
      }
      // 往下滚但还没到底（平滑滚动的途中、用户往回滑了一半）：保持原样

      lastTopRef.current = top
    }

    // passive: true 告诉浏览器"我不会 preventDefault"，滚动性能更好
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [enabled, isAtBottom])

  /**
   * 内容变化时滚底。
   * 用 useLayoutEffect：在浏览器绘制之前同步执行，"内容变高"和"滚到底"在同一帧完成。
   */
  useLayoutEffect(() => {
    if (!enabled) return
    const el = containerRef.current
    if (!el) return

    if (followRef.current) {
      // 这次赋值会触发一个 scroll 事件，但那时已经在底部了，onScroll 会判断成"跟随"
      el.scrollTop = el.scrollHeight
    } else {
      // 用户在看历史，不打扰他，只标记有新内容
      setHasNew(true)
    }
    // dep 是调用方传进来的"内容变化信号"
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dep, enabled])

  return { containerRef, hasNew, scrollToBottom, isAtBottom }
}
