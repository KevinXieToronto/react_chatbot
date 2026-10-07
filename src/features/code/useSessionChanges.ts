import { useMemo } from 'react'
import { useCodeStore } from '../../store/codeStore'
import type { DiffPreview } from '../../lib/diff'

export interface SessionChange {
  /** 工具调用的 id */
  id: string
  preview: DiffPreview
}

/**
 * 本次会话里已经写进磁盘的改动，最新的在前。
 *
 * 不需要新的状态：每个成功的工具调用上本来就挂着审批时的 preview，
 * 从消息里"派生"出来就行（第 07 章：能算出来的值就直接算，别另存一份）。
 */
export function useSessionChanges(): SessionChange[] {
  const messages = useCodeStore((s) => s.messages)

  return useMemo(() => {
    const list: SessionChange[] = []
    for (const m of messages) {
      for (const t of m.toolCalls ?? []) {
        if (t.status === 'success' && t.preview) list.push({ id: t.id, preview: t.preview })
      }
    }
    return list.reverse()
  }, [messages])
}
