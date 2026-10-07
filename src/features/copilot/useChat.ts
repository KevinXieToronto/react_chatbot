import { useCallback, useRef } from 'react'
import { streamChat } from '../../api/chatApi'
import { useStreamBuffer } from '../../hooks/useStreamBuffer'
import { useCopilotStore, createMessage } from '../../store/copilotStore'
import { toWire } from '../../types/chat'

export function useChat() {
  const messages = useCopilotStore((s) => s.messages)
  const addMessage = useCopilotStore((s) => s.addMessage)
  const patchMessage = useCopilotStore((s) => s.patchMessage)
  const setBusy = useCopilotStore((s) => s.setBusy)

  // 当前正在流式输出的那条助手消息的 id
  const activeIdRef = useRef<string | null>(null)

  // 每帧最多提交一次，避免 300 次 setState
  const { push, flush, reset } = useStreamBuffer((text) => {
    if (activeIdRef.current) {
      patchMessage(activeIdRef.current, { content: text })
    }
  })

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return

      const userMessage = createMessage('user', trimmed)
      const assistantMessage = createMessage('assistant', '', 'streaming')

      addMessage(userMessage)
      addMessage(assistantMessage)

      activeIdRef.current = assistantMessage.id
      reset()
      setBusy(true)

      // 收到 done 或 error 之后，这条消息的最终状态就定了
      let settled = false

      try {
        // 注意：store 里的 messages 是本次渲染的快照，不含刚 add 的那条
        const wire = toWire([...messages, userMessage])

        for await (const evt of streamChat(wire)) {
          switch (evt.type) {
            case 'delta':
              push(evt.text)
              break

            case 'done':
              settled = true
              flush() // 把缓冲区里最后一点内容提交掉
              patchMessage(assistantMessage.id, { status: 'complete' })
              break

            case 'error':
              settled = true
              flush()
              patchMessage(assistantMessage.id, { status: 'error', error: evt.message })
              break
          }
        }

        // 流"正常"结束了，却既没收到 done 也没收到 error：
        // 比如后端代码有 bug 提前 res.end()，或者代理把连接干净地关掉了。
        // 不处理的话，这条消息会永远停在 streaming（光标一直闪）。
        if (!settled) {
          flush()
          patchMessage(assistantMessage.id, { status: 'error', error: '连接意外结束，回复可能不完整' })
        }
      } catch (err) {
        flush()
        patchMessage(assistantMessage.id, {
          status: 'error',
          error: err instanceof Error ? err.message : '请求失败',
        })
      } finally {
        setBusy(false)
        activeIdRef.current = null
      }
    },
    [messages, addMessage, patchMessage, setBusy, push, flush, reset],
  )

  return { send }
}
