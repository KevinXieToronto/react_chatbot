import { useCallback, useEffect, useRef } from 'react'

/**
 * 把高频的增量文本合并到每一帧只提交一次。
 *
 * 用法：
 *   const { push, flush, reset } = useStreamBuffer((text) => {
 *     patchMessage(id, { content: text })
 *   })
 *   // 流式循环里：push(delta)
 *   // 结束时：flush()
 */
export function useStreamBuffer(onCommit: (fullText: string) => void) {
  // 累积的完整文本
  const textRef = useRef('')
  // 当前排队中的 rAF id，非 null 表示已经排了队
  const frameRef = useRef<number | null>(null)

  // latest ref pattern（第 09 章）：让调用方传行内箭头函数也不会出问题
  const onCommitRef = useRef(onCommit)
  useEffect(() => {
    onCommitRef.current = onCommit
  })

  const commit = useCallback(() => {
    frameRef.current = null
    onCommitRef.current(textRef.current)
  }, [])

  /** 追加一段增量。一帧内调用多少次，都只会 setState 一次。 */
  const push = useCallback(
    (chunk: string) => {
      textRef.current += chunk

      // 已经排队了就什么都不做 —— 这就是节流的关键
      if (frameRef.current !== null) return
      frameRef.current = requestAnimationFrame(commit)
    },
    [commit],
  )

  /** 立刻提交，不等下一帧。流结束时调用，保证最后一点内容不丢。 */
  const flush = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
    onCommitRef.current(textRef.current)
  }, [])

  const reset = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
    textRef.current = ''
  }, [])

  /** 当前累积的完整文本（不触发渲染，只在事件里读） */
  const getText = useCallback(() => textRef.current, [])

  // 组件卸载时取消挂起的帧，避免对已卸载组件 setState
  useEffect(() => {
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    }
  }, [])

  return { push, flush, reset, getText }
}
