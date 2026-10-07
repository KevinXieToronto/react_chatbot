import { useCallback } from 'react'
import type { ToolOutputEvent } from '../../api/chatApi'
import { useCodeStore } from '../../store/codeStore'
import { appendOutput, hasOutput } from './terminalBuffer'

/**
 * 命令输出 → 终端。和 useFileSync 是同一个套路：useChat 只负责把事件交出来，
 * 怎么处理由代码助手自己决定。
 *
 * 一条命令的第一块输出到达时，自动切到"终端"标签并选中它 ——
 * 就像 Agent 改了文件会自动打开那个文件一样。
 */
export function useTerminalSync() {
  const showTerminal = useCodeStore((s) => s.showTerminal)

  return useCallback(
    (evt: ToolOutputEvent) => {
      const isFirstChunk = !hasOutput(evt.toolUseId)
      appendOutput(evt.toolUseId, evt.stream, evt.chunk)
      if (isFirstChunk) showTerminal(evt.toolUseId)
    },
    [showTerminal],
  )
}
