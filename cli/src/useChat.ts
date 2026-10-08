import { useCallback, useEffect, useRef, useState } from 'react'
// 第 36 章：状态机、消息类型、isAbortError 都来自共享核心 —— 和网页端跑的是同一份代码
import {
  isAbortError,
  toWire,
  turnReducer,
  initialTurnState,
  type ChatMessage,
  type StreamChat,
  type TurnAction,
  type TurnState,
} from '@taskflow/agent-core'
import { streamChat as defaultStreamChat } from './api'

/** 攒多久提交一次文本。40ms ≈ 25 次/秒，肉眼看是连续的 */
const FLUSH_MS = 40

interface Options {
  stream?: StreamChat
  timeoutMs?: number
}

function createMessage(
  role: ChatMessage['role'],
  content: string,
  extra: Partial<ChatMessage> = {},
): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    createdAt: new Date().toISOString(),
    status: 'complete',
    ...extra,
  }
}

/**
 * 终端这一轮的状态 = 共享的 turnReducer 状态 + 已经收到的全部文本。
 * turnReducer 自己不管文本（第 25 章：网页端的文本走 rAF 缓冲直接写进 store 里的消息）；
 * 终端没有那个 store，就在这里顺手把 delta 拼起来。
 */
type LiveTurn = TurnState & { text: string }

const initialLiveTurn: LiveTurn = { ...initialTurnState, text: '' }

/** 先跑共享的 turnReducer，再更新文本。仍然是纯函数 */
function advance(state: LiveTurn, action: TurnAction): LiveTurn {
  const text =
    action.type === 'start' ? '' : action.type === 'delta' ? state.text + action.text : state.text
  return { ...turnReducer(state, action), text }
}

/** 一轮结束后，把状态机的最终状态变成一条"定稿"的助手消息 */
function finalize(turn: LiveTurn, timedOut: boolean): ChatMessage {
  const base = { toolCalls: turn.toolCalls }
  switch (turn.phase) {
    case 'done':
      return createMessage('assistant', turn.text, base)
    case 'aborted':
      return createMessage('assistant', turn.text, {
        ...base,
        status: 'aborted',
        error: timedOut ? '响应超时，已停止' : undefined,
      })
    default:
      return createMessage('assistant', turn.text, {
        ...base,
        status: 'error',
        error: turn.error ?? '出错了',
      })
  }
}

export function useChat({ stream = defaultStreamChat, timeoutMs = 120_000 }: Options = {}) {
  /** 已经结束的消息：只会追加，不会再改 —— 正好交给 <Static> */
  const [messages, setMessages] = useState<ChatMessage[]>([])
  /** 正在进行的这一轮（idle 表示没在跑） */
  const [turn, setTurn] = useState<LiveTurn>(initialLiveTurn)

  // 最新的一轮状态放在 ref 里：每个事件都立刻算，但不一定立刻渲染
  const turnRef = useRef<LiveTurn>(initialLiveTurn)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  // 发请求时要拿到最新的历史，用 ref 避免闭包里读到旧的 messages
  const messagesRef = useRef<ChatMessage[]>([])

  const busy = turn.phase === 'thinking' || turn.phase === 'streaming' || turn.phase === 'tooling'

  /** 立刻把 ref 里的最新状态提交给 React */
  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setTurn(turnRef.current)
  }, [])

  /**
   * 推进状态机。
   * - 文本增量：只算不渲染，最多每 FLUSH_MS 提交一次（Node 里没有 requestAnimationFrame）
   * - 其他事件（工具开始/结束等）：数量少、又重要，立刻提交
   */
  const apply = useCallback(
    (action: TurnAction) => {
      turnRef.current = advance(turnRef.current, action)
      if (action.type !== 'delta') {
        flush()
        return
      }
      if (timerRef.current !== null) return // 已经排队了
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        setTurn(turnRef.current)
      }, FLUSH_MS)
    },
    [flush],
  )

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || controllerRef.current) return

      const userMessage = createMessage('user', trimmed)
      const history = [...messagesRef.current, userMessage]
      messagesRef.current = history
      setMessages(history)

      const controller = new AbortController()
      controllerRef.current = controller
      // 用户中止 + 超时，任何一个触发都会取消 fetch（第 24、28 章）
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(timeoutMs)])

      apply({ type: 'start' })
      let timedOut = false

      try {
        for await (const evt of stream(toWire(history), { signal })) {
          switch (evt.type) {
            case 'delta':
              apply({ type: 'delta', text: evt.text })
              break
            case 'tool_start':
              apply({ type: 'tool_start', id: evt.id, name: evt.name, input: evt.input })
              break
            case 'tool_end':
              apply({ type: 'tool_end', id: evt.id, ok: evt.ok, summary: evt.summary })
              break
            case 'done':
              apply({ type: 'done' })
              break
            case 'error':
              apply({ type: 'error', message: evt.message })
              break
            // 审批、命令输出、上下文这些事件，后面几章再接
          }
        }
        // parseSSE 发现 signal 已中止时会直接结束循环，不抛错 —— 这里补上
        if (signal.aborted) throw signal.reason
        // 流结束了却既没有 done 也没有 error：连接被意外切断
        if (turnRef.current.phase !== 'done' && turnRef.current.phase !== 'error') {
          apply({ type: 'error', message: '连接意外断开，请重试' })
        }
      } catch (err) {
        if (isAbortError(err)) {
          timedOut = (err as DOMException).name === 'TimeoutError'
          apply({ type: 'abort' })
        } else {
          apply({ type: 'error', message: err instanceof Error ? err.message : '请求失败' })
        }
      } finally {
        controllerRef.current = null
        const finished = finalize(turnRef.current, timedOut)
        messagesRef.current = [...messagesRef.current, finished]
        // 这两次 setState 在同一个同步块里，React 会合并成一次渲染：
        // 动态区里的"进行中"消失，同时 <Static> 里多出一条定稿消息
        turnRef.current = initialLiveTurn
        flush()
        setMessages(messagesRef.current)
      }
    },
    [stream, timeoutMs, apply, flush],
  )

  const abort = useCallback(() => {
    controllerRef.current?.abort()
  }, [])

  // 组件卸载（退出程序）时：取消进行中的请求，清掉挂起的定时器
  useEffect(() => {
    return () => {
      controllerRef.current?.abort()
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    }
  }, [])

  return { messages, turn, busy, send, abort }
}
