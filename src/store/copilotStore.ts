import { create } from 'zustand'
import type { ChatMessage } from '../types/chat'

interface CopilotState {
  open: boolean
  messages: ChatMessage[]
  /** 正在等待回复 */
  busy: boolean
  /** 最近被 Agent 修改过的任务 id，用来做高亮提示 */
  changedTaskIds: string[]
}

interface CopilotActions {
  toggle: () => void
  close: () => void
  addMessage: (message: ChatMessage) => void
  /** 按 id 局部更新一条消息（流式输出时会频繁调用） */
  patchMessage: (id: string, patch: Partial<ChatMessage>) => void
  setBusy: (busy: boolean) => void
  clear: () => void
  markChanged: (taskId: string) => void
  clearChanged: () => void
}

export const useCopilotStore = create<CopilotState & CopilotActions>((set) => ({
  open: false,
  messages: [],
  busy: false,
  changedTaskIds: [],

  toggle: () => set((s) => ({ open: !s.open })),
  close: () => set({ open: false }),

  addMessage: (message) => set((s) => ({ messages: [...s.messages, message] })),

  patchMessage: (id, patch) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    })),

  setBusy: (busy) => set({ busy }),
  clear: () => set({ messages: [] }),

  markChanged: (taskId) =>
    set((s) => ({
      // 去重，且只保留最近 20 条
      changedTaskIds: [taskId, ...s.changedTaskIds.filter((id) => id !== taskId)].slice(0, 20),
    })),

  clearChanged: () => set({ changedTaskIds: [] }),
}))

/** 造一条新消息的小工具 */
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
