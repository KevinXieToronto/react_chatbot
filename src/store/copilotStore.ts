import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PersistStorage, StorageValue } from 'zustand/middleware'
import type { ChatMessage } from '../types/chat'

export interface Conversation {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: string
  updatedAt: string
  /** 累计 token 用量 */
  usage: { input: number; output: number }
}

interface CopilotState {
  open: boolean
  busy: boolean
  conversations: Conversation[]
  activeId: string | null
  changedTaskIds: string[]
  /** 侧栏（会话列表）是否展开 */
  showSessions: boolean
}

interface CopilotActions {
  toggle: () => void
  close: () => void
  setBusy: (busy: boolean) => void
  toggleSessions: () => void

  newConversation: () => string
  selectConversation: (id: string) => void
  deleteConversation: (id: string) => void
  renameConversation: (id: string, title: string) => void

  addMessage: (message: ChatMessage) => void
  patchMessage: (id: string, patch: Partial<ChatMessage>) => void
  /** 删掉某条消息及其之后的所有消息（重试时用） */
  truncateFrom: (messageId: string) => void
  addUsage: (input: number, output: number) => void

  markChanged: (taskId: string) => void
  clearChanged: () => void
}

/** 真正写进 localStorage 的那部分（见下面的 partialize） */
interface PersistedCopilot {
  conversations: Conversation[]
  activeId: string | null
}

/** 最多保留多少个会话 —— localStorage 有 5MB 上限，不能无限存 */
const MAX_CONVERSATIONS = 20

function createConversation(): Conversation {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    title: '新对话',
    messages: [],
    createdAt: now,
    updatedAt: now,
    usage: { input: 0, output: 0 },
  }
}

/** 用第一条用户消息自动命名会话 */
function deriveTitle(messages: ChatMessage[]): string {
  const first = messages.find((m) => m.role === 'user')
  if (!first) return '新对话'
  const text = first.content.trim().replace(/\s+/g, ' ')
  return text.length > 18 ? text.slice(0, 18) + '…' : text
}

/**
 * 读回来的会话里，如果有消息停在 streaming —— 说明保存的那一刻它正在输出，
 * 然后页面被刷新 / 关掉了。那个流早就断了，不会再有人更新它。
 * 不修正的话，它会以 streaming 状态被读回来：光标永远在闪，工具永远在转圈。
 */
function fixInterrupted(conv: Conversation): Conversation {
  if (!conv.messages.some((m) => m.status === 'streaming')) return conv
  return {
    ...conv,
    messages: conv.messages.map((m) =>
      m.status === 'streaming'
        ? {
            ...m,
            status: 'aborted' as const,
            toolCalls: m.toolCalls?.map((t) =>
              t.status === 'running' ? { ...t, status: 'error' as const, summary: '已中断' } : t,
            ),
          }
        : m,
    ),
  }
}

/**
 * 包一层 localStorage：写入最多每 delay 毫秒落盘一次。
 *
 * persist 默认每次 set() 都会把要持久化的状态 JSON.stringify 一遍再写进 localStorage。
 * 流式输出时 patchMessage 每一帧都在 set()，也就是每秒几十次序列化【全部会话】—— 主线程白白忙。
 * 这里只记住"最新的那一份"，攒一会儿再一次性写；关页面前（pagehide）把没写的补上。
 */
function createThrottledStorage<S>(delay = 1000): PersistStorage<S> {
  let pending: { name: string; value: StorageValue<S> } | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  function flush() {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    if (!pending) return
    const { name, value } = pending
    pending = null
    try {
      localStorage.setItem(name, JSON.stringify(value))
    } catch (err) {
      // QuotaExceededError：localStorage 满了（一般是 5MB）。
      // 不能让它冒泡把整个应用搞崩 —— 内存里的对话照常能用，只是这次没存上。
      console.warn('[copilot] 对话没能保存到 localStorage（空间可能满了）：', err)
    }
  }

  window.addEventListener('pagehide', flush)

  return {
    getItem: (name) => {
      const raw = localStorage.getItem(name)
      return raw ? (JSON.parse(raw) as StorageValue<S>) : null
    },
    setItem: (name, value) => {
      pending = { name, value } // 只保留最新的一份，旧的直接丢掉
      timer ??= setTimeout(flush, delay)
    },
    removeItem: (name) => {
      pending = null
      localStorage.removeItem(name)
    },
  }
}

export const useCopilotStore = create<CopilotState & CopilotActions>()(
  persist(
    (set, get) => ({
      open: false,
      busy: false,
      conversations: [],
      activeId: null,
      changedTaskIds: [],
      showSessions: false,

      toggle: () => {
        const { open, conversations } = get()
        // 第一次打开时自动建一个会话
        if (!open && conversations.length === 0) {
          const conv = createConversation()
          set({ open: true, conversations: [conv], activeId: conv.id })
          return
        }
        set({ open: !open })
      },

      close: () => set({ open: false, showSessions: false }),
      setBusy: (busy) => set({ busy }),
      toggleSessions: () => set((s) => ({ showSessions: !s.showSessions })),

      // ⚠️ 下面三个"切换会话"的操作，在正在回答（busy）时一律不执行。
      //    这一轮的流式文本、工具状态、用量，都是按"当前会话"写回的；
      //    中途切走的话，它们会写到另一个会话里去，或者写不回去 ——
      //    原来那条消息永远停在 streaming，用量记到了别的会话头上。
      newConversation: () => {
        const { busy, activeId } = get()
        if (busy) return activeId ?? ''
        const conv = createConversation()
        set((s) => ({
          // 超出上限就丢掉最旧的
          conversations: [conv, ...s.conversations].slice(0, MAX_CONVERSATIONS),
          activeId: conv.id,
          showSessions: false,
        }))
        return conv.id
      },

      selectConversation: (id) => {
        if (get().busy) return
        set({ activeId: id, showSessions: false })
      },

      deleteConversation: (id) => {
        if (get().busy) return
        set((s) => {
          const conversations = s.conversations.filter((c) => c.id !== id)
          // 删掉的是当前会话就切到第一个；一个都没了就新建
          if (s.activeId !== id) return { conversations }
          if (conversations.length > 0) {
            return { conversations, activeId: conversations[0].id }
          }
          const conv = createConversation()
          return { conversations: [conv], activeId: conv.id }
        })
      },

      renameConversation: (id, title) =>
        set((s) => ({
          conversations: s.conversations.map((c) => (c.id === id ? { ...c, title } : c)),
        })),

      addMessage: (message) =>
        set((s) => ({
          conversations: s.conversations.map((c) => {
            if (c.id !== s.activeId) return c
            const messages = [...c.messages, message]
            return {
              ...c,
              messages,
              // 标题还是默认值时，用第一条用户消息自动命名
              title: c.title === '新对话' ? deriveTitle(messages) : c.title,
              updatedAt: new Date().toISOString(),
            }
          }),
        })),

      patchMessage: (id, patch) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === s.activeId
              ? {
                  ...c,
                  messages: c.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
                }
              : c,
          ),
        })),

      truncateFrom: (messageId) =>
        set((s) => ({
          conversations: s.conversations.map((c) => {
            if (c.id !== s.activeId) return c
            const index = c.messages.findIndex((m) => m.id === messageId)
            if (index === -1) return c
            return { ...c, messages: c.messages.slice(0, index) }
          }),
        })),

      addUsage: (input, output) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === s.activeId
              ? { ...c, usage: { input: c.usage.input + input, output: c.usage.output + output } }
              : c,
          ),
        })),

      markChanged: (taskId) =>
        set((s) => ({
          changedTaskIds: [taskId, ...s.changedTaskIds.filter((id) => id !== taskId)].slice(0, 20),
        })),

      clearChanged: () => set({ changedTaskIds: [] }),
    }),
    {
      name: 'taskflow:copilot',
      version: 2,
      storage: createThrottledStorage<PersistedCopilot>(),
      // 只持久化对话本身。open / busy / changedTaskIds 都是临时状态。
      partialize: (state): PersistedCopilot => ({
        conversations: state.conversations,
        activeId: state.activeId,
      }),
      // 版本升级时的迁移。没有它，改了数据结构后老用户会直接崩。
      migrate: (persisted, version) => {
        if (version < 2) {
          // v1 存的是扁平的 messages 数组，不兼容 —— 直接丢弃重来
          return { conversations: [], activeId: null }
        }
        return persisted as PersistedCopilot
      },
      // 读回来的数据怎么和初始状态合并。默认是浅合并，这里顺便把"中断在半路"的消息修正掉
      merge: (persisted, current) => {
        const p = persisted as PersistedCopilot | undefined
        if (!p) return current
        return {
          ...current,
          ...p,
          conversations: p.conversations.map(fixInterrupted),
        }
      },
    },
  ),
)

// ── 派生 selector ──────────────────────────────

/** 当前会话 */
export function useActiveConversation(): Conversation | null {
  return useCopilotStore((s) => s.conversations.find((c) => c.id === s.activeId) ?? null)
}

/** 当前会话的消息（没有会话时返回稳定的空数组，避免每次新建导致重渲染） */
const EMPTY: ChatMessage[] = []
export function useMessages(): ChatMessage[] {
  return useCopilotStore((s) => s.conversations.find((c) => c.id === s.activeId)?.messages ?? EMPTY)
}

export function createMessage(
  role: ChatMessage['role'],
  content: string,
  status: ChatMessage['status'] = 'complete',
): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    createdAt: new Date().toISOString(),
    status,
  }
}
