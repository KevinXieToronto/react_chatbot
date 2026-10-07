import { create } from 'zustand'
import type { ChatMessage } from '../types/chat'

/**
 * 代码助手的状态。
 *
 * 故意【不持久化】：代码助手真正的"状态"是磁盘上的文件，
 * 对话只是过程。刷新页面从零开始，比恢复一段和文件现状对不上的旧对话更安全。
 */
interface CodeState {
  messages: ChatMessage[]
  busy: boolean
  /** 文件面板里当前打开的文件 */
  selectedPath: string | null
  /** 本次会话里被 Agent 改过的文件（最近的在前） */
  changedPaths: string[]
}

interface CodeActions {
  addMessage: (message: ChatMessage) => void
  patchMessage: (id: string, patch: Partial<ChatMessage>) => void
  truncateFrom: (messageId: string) => void
  setBusy: (busy: boolean) => void
  clearMessages: () => void
  selectFile: (path: string | null) => void
  markChanged: (path: string) => void
}

export const useCodeStore = create<CodeState & CodeActions>()((set) => ({
  messages: [],
  busy: false,
  selectedPath: null,
  changedPaths: [],

  addMessage: (message) => set((s) => ({ messages: [...s.messages, message] })),

  patchMessage: (id, patch) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    })),

  truncateFrom: (messageId) =>
    set((s) => {
      const index = s.messages.findIndex((m) => m.id === messageId)
      return index === -1 ? s : { messages: s.messages.slice(0, index) }
    }),

  setBusy: (busy) => set({ busy }),
  clearMessages: () => set({ messages: [], changedPaths: [] }),
  selectFile: (selectedPath) => set({ selectedPath }),

  markChanged: (path) =>
    set((s) => ({
      changedPaths: [path, ...s.changedPaths.filter((p) => p !== path)].slice(0, 50),
    })),
}))
