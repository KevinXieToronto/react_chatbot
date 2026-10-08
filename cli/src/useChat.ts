import { useCallback, useEffect, useRef, useState } from 'react'
// 第 36 章：状态机、消息类型、isAbortError 都来自共享核心 —— 和网页端跑的是同一份代码
import {
  isAbortError,
  toWire,
  turnReducer,
  initialTurnState,
  type ChatMessage,
  type ContextReport,
  type StreamChat,
  type TurnAction,
  type TurnState,
  type UsageTotals,
} from '@taskflow/agent-core'
import { streamChat as defaultStreamChat } from './api'
import { appendOutput } from './outputTail'
import { addText, addTool, settle, type Entry, type Segment } from './transcript'

/** 攒多久提交一次文本。40ms ≈ 25 次/秒，肉眼看是连续的 */
const FLUSH_MS = 40

interface Options {
  stream?: StreamChat
  timeoutMs?: number
}

/** 动态区要画的东西：还没定稿的段落，从第 cursor 段开始 */
export interface LiveView {
  segments: Segment[]
  cursor: number
}

const EMPTY_LIVE: LiveView = { segments: [], cursor: 0 }

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

/** 一轮结束后，把状态机的最终状态变成一条"定稿"的助手消息（给下一轮当历史用） */
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
  /** 对话历史：发请求时用（toWire） */
  const [messages, setMessages] = useState<ChatMessage[]>([])
  /** 已经定稿、交给 <Static> 的记录：只追加，不修改 */
  const [entries, setEntries] = useState<Entry[]>([])
  /** 正在进行的这一轮（idle 表示没在跑） */
  const [turn, setTurn] = useState<LiveTurn>(initialLiveTurn)
  /** 这一轮里还没定稿的部分 */
  const [live, setLive] = useState<LiveView>(EMPTY_LIVE)
  /** 每个工具调用的命令输出（第 32 章），key 是 ToolCall.id */
  const [outputs, setOutputs] = useState<Record<string, string>>({})
  /** 最近一次调用模型前的上下文情况（第 33 章） */
  const [context, setContext] = useState<ContextReport | null>(null)
  /** 整个会话累计的 token 用量（第 33 章） */
  const [usage, setUsage] = useState<UsageTotals | null>(null)
  /** 上一轮的用量，状态栏算缓存命中率用 */
  const [lastUsage, setLastUsage] = useState<UsageTotals | null>(null)

  // 最新的状态放在 ref 里：每个事件都立刻算，但不一定立刻渲染（第 35 章）
  const turnRef = useRef<LiveTurn>(initialLiveTurn)
  const segmentsRef = useRef<Segment[]>([])
  const cursorRef = useRef(0)
  const outputsRef = useRef<Record<string, string>>({})
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const messagesRef = useRef<ChatMessage[]>([])
  const idRef = useRef(0)

  // 从发出请求到这一轮收尾（finally 里重置成 idle）都算忙。等审批（第 39 章）也算
  const busy = turn.phase !== 'idle'

  const nextId = useCallback(() => `e${++idRef.current}`, [])

  /**
   * 立刻把 ref 里的最新状态提交给 React。
   * 顺便把已经定稿的块挑出来追加进 <Static>，动态区只剩还在变的那一小截。
   * 这几个 setState 在同一个同步块里，React 会合并成一次渲染。
   */
  const flush = useCallback(
    (closed = false) => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      const result = settle(segmentsRef.current, cursorRef.current, turnRef.current.toolCalls, closed, nextId)
      segmentsRef.current = result.segments
      cursorRef.current = result.cursor
      if (result.entries.length > 0) setEntries((prev) => [...prev, ...result.entries])
      setLive({ segments: result.segments, cursor: result.cursor })
      setTurn(turnRef.current)
      setOutputs(outputsRef.current)
    },
    [nextId],
  )

  /** 高频事件（文字、命令输出）：最多每 FLUSH_MS 提交一次 */
  const schedule = useCallback(() => {
    if (timerRef.current !== null) return // 已经排队了
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      flush()
    }, FLUSH_MS)
  }, [flush])

  /** 推进状态机。文本增量只排队，其他事件（工具开始/结束等）数量少、又重要，立刻提交 */
  const apply = useCallback(
    (action: TurnAction) => {
      turnRef.current = advance(turnRef.current, action)
      if (action.type === 'delta') {
        segmentsRef.current = addText(segmentsRef.current, action.text)
        schedule()
        return
      }
      if (action.type === 'tool_start') {
        segmentsRef.current = addTool(segmentsRef.current, action.id)
      }
      flush()
    },
    [flush, schedule],
  )

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || controllerRef.current) return

      const userMessage = createMessage('user', trimmed)
      const history = [...messagesRef.current, userMessage]
      messagesRef.current = history
      setMessages(history)
      setEntries((prev) => [...prev, { kind: 'user', id: nextId(), text: trimmed }])

      const controller = new AbortController()
      controllerRef.current = controller
      // 用户中止 + 超时，任何一个触发都会取消 fetch（第 24、28 章）
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(timeoutMs)])

      segmentsRef.current = []
      cursorRef.current = 0
      outputsRef.current = {}
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
            case 'tool_output':
              // 和网页端一样，命令输出不进状态机：一秒能来几十块，单独攒着、节流提交
              outputsRef.current = {
                ...outputsRef.current,
                [evt.toolUseId]: appendOutput(outputsRef.current[evt.toolUseId] ?? '', evt.chunk),
              }
              schedule()
              break
            case 'context':
              setContext({
                tokens: evt.tokens,
                before: evt.before,
                budget: evt.budget,
                exact: evt.exact,
                truncated: evt.truncated,
                dropped: evt.dropped,
                summarized: evt.summarized,
              })
              break
            case 'done': {
              apply({ type: 'done' })
              if (evt.usage) {
                const u: UsageTotals = {
                  input: evt.usage.input_tokens ?? 0,
                  output: evt.usage.output_tokens ?? 0,
                  cacheRead: evt.usage.cache_read_input_tokens ?? 0,
                  cacheWrite: evt.usage.cache_creation_input_tokens ?? 0,
                }
                setLastUsage(u)
                setUsage((prev) => ({
                  input: (prev?.input ?? 0) + u.input,
                  output: (prev?.output ?? 0) + u.output,
                  cacheRead: (prev?.cacheRead ?? 0) + (u.cacheRead ?? 0),
                  cacheWrite: (prev?.cacheWrite ?? 0) + (u.cacheWrite ?? 0),
                }))
              }
              break
            }
            case 'error':
              apply({ type: 'error', message: evt.message })
              break
            // 审批（第 39 章接上）、invalidate（终端没有缓存要刷新）暂时忽略
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

        // 整轮结束：剩下的全部定稿，再补一条"已中止 / 出错"的提示
        flush(true)
        const tail: Entry[] = []
        if (finished.status === 'aborted') {
          tail.push({ kind: 'notice', id: nextId(), tone: 'warn', text: finished.error ?? '已中止' })
        } else if (finished.status === 'error') {
          tail.push({ kind: 'notice', id: nextId(), tone: 'error', text: finished.error ?? '出错了' })
        } else if (segmentsRef.current.at(-1)?.kind === 'tool') {
          tail.push({ kind: 'spacer', id: nextId() })
        }
        if (tail.length > 0) setEntries((prev) => [...prev, ...tail])

        turnRef.current = initialLiveTurn
        segmentsRef.current = []
        cursorRef.current = 0
        setTurn(initialLiveTurn)
        setLive(EMPTY_LIVE)
        setMessages(messagesRef.current)
      }
    },
    [stream, timeoutMs, apply, flush, schedule, nextId],
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

  return { messages, entries, turn, live, outputs, context, usage, lastUsage, busy, send, abort }
}
