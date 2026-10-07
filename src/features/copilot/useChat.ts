import { useCallback, useEffect, useReducer, useRef } from 'react'
import { streamChat } from '../../api/chatApi'
import type { InvalidateEvent } from '../../api/chatApi'
import { useStreamBuffer } from '../../hooks/useStreamBuffer'
import { createMessage } from '../../store/copilotStore'
import { toWire } from '../../types/chat'
import type { ChatMode, ChatSession } from '../../types/chat'
import { turnReducer, initialTurnState, describePhase } from './turnReducer'
import type { TurnAction, TurnState } from './turnReducer'

/**
 * 总时长上限，见第 24 章。
 * 注意这是【总时长】，不是"多久没收到数据"：一轮对话从发出到结束最多 5 分钟。
 * 编码任务读文件、改文件一两分钟很正常，5 分钟够用；第 30 章有了审批以后会改成空闲超时。
 */
const REQUEST_TIMEOUT = 300_000

/** 用户主动停止（AbortError）或超时（TimeoutError）都不算真正的错误，见第 24 章 */
function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && (err.name === 'AbortError' || err.name === 'TimeoutError')
}

interface UseChatOptions {
  /** 对话模式：tasks = 任务 Copilot，code = 代码助手 */
  mode?: ChatMode
  /** 后端通知"数据变了"时调用。任务 Copilot 用它刷新任务缓存，代码助手用它刷新文件面板 */
  onInvalidate?: (evt: InvalidateEvent) => void
}

/**
 * 一轮对话的完整流程：发请求、读流、驱动 turnReducer、写回消息存储。
 *
 * 第 29 章起，消息存在哪由调用方通过 session 决定，
 * 这样 Copilot 和代码助手共用同一套流式 / 中止 / 竞态处理逻辑。
 */
export function useChat(session: ChatSession, { mode = 'tasks', onInvalidate }: UseChatOptions = {}) {
  // 解构出来的函数都是 store 里的 action（getMessages 是调用方的模块级函数），引用稳定，放进依赖数组不会导致重建
  const { messages, getMessages, addMessage, patchMessage, truncateFrom, setBusy, addUsage } = session

  // 当前这一轮的阶段，只用来驱动界面上的提示（"正在思考…""正在读取文件…"）
  const [turn, dispatch] = useReducer(turnReducer, initialTurnState)

  const activeIdRef = useRef<string | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const requestIdRef = useRef(0)

  // latest ref：调用方传行内箭头函数也不会让 send 每次渲染都重建
  const onInvalidateRef = useRef(onInvalidate)
  useEffect(() => {
    onInvalidateRef.current = onInvalidate
  })

  const { push, flush, reset, getText } = useStreamBuffer((text) => {
    if (activeIdRef.current) {
      patchMessage(activeIdRef.current, { content: text })
    }
  })

  const stop = useCallback(() => {
    controllerRef.current?.abort()
  }, [])

  useEffect(() => {
    return () => {
      controllerRef.current?.abort()
    }
  }, [])

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return

      controllerRef.current?.abort()
      const myId = ++requestIdRef.current

      const controller = new AbortController()
      controllerRef.current = controller
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(REQUEST_TIMEOUT)])

      const userMessage = createMessage('user', trimmed)
      const assistantMessage = createMessage('assistant', '', 'streaming')

      addMessage(userMessage)
      addMessage(assistantMessage)

      activeIdRef.current = assistantMessage.id
      reset()
      setBusy(true)

      /**
       * 这一轮的状态有两个去处（第 28 章）：
       * - 界面上的阶段提示 → dispatch 给 useReducer 的 turn
       * - 这条消息上的工具列表 → 写进 store，跟着消息一起保存、一起渲染
       *
       * 两者由同一个纯函数 turnReducer 算出来：局部变量 local 跑一遍 reducer，
       * 工具列表变了就【当场】写进这条消息，状态变了才 dispatch。
       * local 是这次 send 自己的变量，就算之后被新请求顶掉，它也只会写回自己那条消息。
       */
      let local: TurnState = turnReducer(initialTurnState, { type: 'start' })
      dispatch({ type: 'start' })

      const apply = (action: TurnAction) => {
        const next = turnReducer(local, action)
        if (next === local) return // 什么都没变（比如阶段没变的 delta）：不写 store，也不渲染
        if (next.toolCalls !== local.toolCalls) {
          patchMessage(assistantMessage.id, { toolCalls: next.toolCalls })
        }
        local = next
        // 界面上的阶段提示只属于当前请求；被顶掉的旧请求别去动它
        if (myId === requestIdRef.current) dispatch(action)
      }

      // 已经收到 done / error，这条消息的最终状态定了（见第 24 章）
      let settled = false

      try {
        // 从 session 现取，不能用闭包里的 messages：retry 会先 truncateFrom 再调 send（见第 28 章）。
        // 此刻里面已经有刚 add 的 user 和空的 assistant（后者会被 toWire 过滤掉）
        const wire = toWire(getMessages())

        for await (const evt of streamChat(wire, { signal, mode })) {
          if (myId !== requestIdRef.current) {
            // 被新请求顶掉了：只收尾自己这条（见第 24 章）。
            // apply abort 会把还在转圈的工具标成"已取消"
            apply({ type: 'abort' })
            patchMessage(assistantMessage.id, { status: 'aborted' })
            return
          }

          switch (evt.type) {
            case 'delta':
              apply({ type: 'delta', text: evt.text })
              push(evt.text)
              break

            case 'tool_start':
              apply({ type: 'tool_start', id: evt.id, name: evt.name, input: evt.input })
              break

            case 'tool_end':
              apply({ type: 'tool_end', id: evt.id, ok: evt.ok, summary: evt.summary })
              break

            case 'invalidate':
              onInvalidateRef.current?.(evt)
              break

            case 'done':
              settled = true
              flush()
              apply({ type: 'done' })
              patchMessage(assistantMessage.id, { status: 'complete' })
              if (evt.usage) {
                addUsage?.(evt.usage.input_tokens ?? 0, evt.usage.output_tokens ?? 0)
              }
              break

            case 'error':
              settled = true
              flush()
              apply({ type: 'error', message: evt.message })
              patchMessage(assistantMessage.id, {
                status: 'error',
                error: evt.message,
                errorKind: evt.kind,
              })
              break
          }
        }

        // 流干净地结束了，却没收到 done / error（见第 22 章）
        if (!settled) {
          flush()
          const message = '连接意外结束，回复可能不完整'
          apply({ type: 'error', message })
          patchMessage(assistantMessage.id, { status: 'error', error: message })
        }
      } catch (err) {
        // 状态已定，只是连接还没关就被 abort 了：别再改（见第 24 章）
        if (settled) return

        if (myId !== requestIdRef.current) {
          apply({ type: 'abort' })
          patchMessage(assistantMessage.id, { status: 'aborted' })
          return
        }

        if (isAbortError(err)) {
          flush()
          apply({ type: 'abort' })
          patchMessage(assistantMessage.id, { status: 'aborted', content: getText() })
        } else {
          flush()
          const message = err instanceof Error ? err.message : '请求失败'
          apply({ type: 'error', message })
          patchMessage(assistantMessage.id, { status: 'error', error: message })
        }
      } finally {
        if (myId === requestIdRef.current) {
          setBusy(false)
          activeIdRef.current = null
          controllerRef.current = null
        }
      }
    },
    [mode, getMessages, addMessage, patchMessage, setBusy, push, flush, reset, getText, addUsage],
  )

  /**
   * 重试：删掉从这条助手消息开始的所有内容，
   * 用它前面的那条用户消息重新提问。
   */
  const retry = useCallback(
    (assistantMessageId: string) => {
      const index = messages.findIndex((m) => m.id === assistantMessageId)
      if (index <= 0) return

      const userMessage = messages[index - 1]
      if (userMessage.role !== 'user') return

      // 先把用户消息和助手消息都删掉（send 会重新加）
      truncateFrom(userMessage.id)
      void send(userMessage.content)
    },
    [messages, truncateFrom, send],
  )

  return { send, stop, retry, turn, phaseText: describePhase(turn) }
}
