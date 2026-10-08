import { create } from 'zustand'
import type { ChatMessage } from '../types/chat'

/** 右边面板的三个标签：文件 / 变更（第 31 章）/ 终端（第 32 章） */
export type PanelTab = 'files' | 'changes' | 'terminal'

/** 代码助手用哪个引擎：code = 第 29~33 章手写的循环，sdk = OpenAI Agents SDK（第 34 章） */
export type CodeEngine = 'code' | 'sdk'

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
  /** 右边面板当前的标签。第 32 章起放进 store：来了命令输出要能从外面切到"终端" */
  panelTab: PanelTab
  /** 终端里显示哪一次 run_command（ToolCall.id）。null = 默认显示最近一次 */
  terminalId: string | null
  engine: CodeEngine
}

interface CodeActions {
  addMessage: (message: ChatMessage) => void
  patchMessage: (id: string, patch: Partial<ChatMessage>) => void
  truncateFrom: (messageId: string) => void
  setBusy: (busy: boolean) => void
  clearMessages: () => void
  selectFile: (path: string | null) => void
  markChanged: (path: string) => void
  setPanelTab: (tab: PanelTab) => void
  /** 切到"终端"标签并显示某条命令的输出 */
  showTerminal: (toolUseId: string) => void
  setEngine: (engine: CodeEngine) => void
}

export const useCodeStore = create<CodeState & CodeActions>()((set) => ({
  messages: [],
  busy: false,
  selectedPath: null,
  changedPaths: [],
  panelTab: 'files',
  terminalId: null,
  engine: 'code',

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
  clearMessages: () => set({ messages: [], changedPaths: [], terminalId: null }),
  selectFile: (selectedPath) => set({ selectedPath }),

  markChanged: (path) =>
    set((s) => ({
      changedPaths: [path, ...s.changedPaths.filter((p) => p !== path)].slice(0, 50),
    })),

  setPanelTab: (panelTab) => set({ panelTab }),
  showTerminal: (terminalId) => set({ terminalId, panelTab: 'terminal' }),
  setEngine: (engine) => set({ engine }),
}))
