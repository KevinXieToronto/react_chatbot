import { useCallback, useEffect, useRef } from 'react'
import { streamChat } from '../../api/chatApi'
import { useStreamBuffer } from '../../hooks/useStreamBuffer'
import { useCopilotStore, createMessage } from '../../store/copilotStore'
import { toWire } from '../../types/chat'

/**
 * 单次对话的超时时间。模型偶尔会卡住，不能让用户无限等。
 * ⚠️ AbortSignal.timeout 算的是【总时长】，不是"多久没收到数据"：
 *    带好几轮工具调用的长回答，正常情况下也可能跑上两三分钟，所以给足 5 分钟。
 *    更精细的做法是"空闲超时"（每收到一个事件就重新计时），见本章练习 6。
 */
const REQUEST_TIMEOUT = 300_000

/**
 * 判断一个错误是不是"中止类"（用户主动停止，或者超时）。这两种都不算真正的错误。
 * ⚠️ `AbortSignal.timeout()` 触发时抛出的 `name` 是 `'TimeoutError'`，不是 `'AbortError'`——
 * 漏掉这个分支的话，超时会走进下面的"真正报错"逻辑，界面上不会显示"（已停止）"。
 */
function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && (err.name === 'AbortError' || err.name === 'TimeoutError')
}

export function useChat() {
  const messages = useCopilotStore((s) => s.messages)
  const addMessage = useCopilotStore((s) => s.addMessage)
  const patchMessage = useCopilotStore((s) => s.patchMessage)
  const setBusy = useCopilotStore((s) => s.setBusy)

  const activeIdRef = useRef<string | null>(null)

  /** 当前请求的 controller，用来"停止生成" */
  const controllerRef = useRef<AbortController | null>(null)

  /**
   * 请求令牌。
   * 即使 abort 了，已经在路上的响应仍可能到达并写 state ——
   * 这个计数器是最后一道防线。
   */
  const requestIdRef = useRef(0)

  const { push, flush, reset, getText } = useStreamBuffer((text) => {
    if (activeIdRef.current) {
      patchMessage(activeIdRef.current, { content: text })
    }
  })

  /** 停止当前生成 */
  const stop = useCallback(() => {
    controllerRef.current?.abort()
  }, [])

  // 组件卸载（比如用户关了整个面板并且面板被卸载）时取消进行中的请求
  useEffect(() => {
    return () => {
      controllerRef.current?.abort()
    }
  }, [])

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return

      // ① 取消上一个（如果还在跑）
      controllerRef.current?.abort()

      // ② 领一个新号
      const myId = ++requestIdRef.current

      // ③ 新建 controller —— 绝不能复用旧的，abort 过的 controller 会让新请求立刻失败
      const controller = new AbortController()
      controllerRef.current = controller

      // 用户主动取消 或 超时，任意一个触发就中止
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(REQUEST_TIMEOUT)])

      const userMessage = createMessage('user', trimmed)
      const assistantMessage = createMessage('assistant', '', 'streaming')

      addMessage(userMessage)
      addMessage(assistantMessage)

      activeIdRef.current = assistantMessage.id
      reset()
      setBusy(true)

      // 已经收到 done / error，这条消息的最终状态定了
      let settled = false

      try {
        const wire = toWire([...messages, userMessage])

        for await (const evt of streamChat(wire, { signal })) {
          // 每个事件都检查一次：我还是最新的请求吗？
          // 不是就直接退出，别污染界面。
          if (myId !== requestIdRef.current) {
            // 缓冲区和 busy 已经归新请求了，只把自己这条标成"已停止"，
            // 否则它会一直停在 streaming（光标永远在闪）
            patchMessage(assistantMessage.id, { status: 'aborted' })
            return
          }

          switch (evt.type) {
            case 'delta':
              push(evt.text)
              break

            case 'done':
              settled = true
              flush()
              patchMessage(assistantMessage.id, { status: 'complete' })
              break

            case 'error':
              settled = true
              flush()
              patchMessage(assistantMessage.id, { status: 'error', error: evt.message })
              break
          }
        }

        // 流干净地结束了，却没收到 done / error（见第 22 章）
        if (!settled) {
          flush()
          patchMessage(assistantMessage.id, { status: 'error', error: '连接意外结束，回复可能不完整' })
        }
      } catch (err) {
        // 已经收到 done / error，只是连接还没关就被 abort 了：状态已定，别再改，
        // 不然完整的回答会被标成 aborted、被 toWire 排除出上下文
        if (settled) return

        if (myId !== requestIdRef.current) {
          // 被新请求顶掉（send 开头 abort 了我）：同上，只标记自己这条
          patchMessage(assistantMessage.id, { status: 'aborted' })
          return
        }

        if (isAbortError(err)) {
          // 主动中止：保留已经生成的内容，但标记成 aborted。
          // 这一步很关键 —— toWire 会把 aborted 的消息过滤掉，
          // 不让半截回答进入下一轮的上下文。
          flush()
          const partial = getText()
          patchMessage(assistantMessage.id, {
            status: 'aborted',
            content: partial,
          })
        } else {
          flush()
          patchMessage(assistantMessage.id, {
            status: 'error',
            error: err instanceof Error ? err.message : '请求失败',
          })
        }
      } finally {
        // 只有"我还是最新请求"时才清理状态。
        // 否则会把新请求刚设好的 busy=true 给清掉。
        if (myId === requestIdRef.current) {
          setBusy(false)
          activeIdRef.current = null
          controllerRef.current = null
        }
      }
    },
    [messages, addMessage, patchMessage, setBusy, push, flush, reset, getText],
  )

  return { send, stop }
}
