import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { fileKeys } from '../../api/queryKeys'
import type { InvalidateEvent } from '../../api/chatApi'
import { useCodeStore } from '../../store/codeStore'

/**
 * Agent 改了文件 → 刷新文件面板。和第 26 章的 useTaskSync 是同一个思路：
 * 服务端发 invalidate 事件，前端让对应的 TanStack Query 缓存失效。
 *
 * 文件内容没法"乐观地"算出来（我们手上没有改后的全文），所以只做失效 + 重新拉取。
 */
export function useFileSync() {
  const queryClient = useQueryClient()
  const markChanged = useCodeStore((s) => s.markChanged)
  const selectFile = useCodeStore((s) => s.selectFile)

  return useCallback(
    (evt: InvalidateEvent) => {
      if (evt.resource !== 'files') return

      if (evt.path) {
        markChanged(evt.path)
        // 自动打开刚被改的文件，让用户立刻看到改了什么
        selectFile(evt.path)
      }

      // 失效 ['files'] 会连带失效文件树和所有文件内容
      void queryClient.invalidateQueries({ queryKey: fileKeys.all })
    },
    [queryClient, markChanged, selectFile],
  )
}
