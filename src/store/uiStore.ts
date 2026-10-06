import { create } from 'zustand'

/**
 * 只留纯粹的、不该出现在 URL 里的 UI 状态。
 * 筛选和搜索关键词已经搬到 URL（见 useTaskFilters）。
 * 因为剩下的都是临时状态，也不再需要 persist 了。
 */
interface UIState {
  showForm: boolean
  editingId: string | null
}

interface UIActions {
  toggleForm: () => void
  closeForm: () => void
  setEditingId: (id: string | null) => void
}

export const useUIStore = create<UIState & UIActions>((set) => ({
  showForm: false,
  editingId: null,

  toggleForm: () => set((state) => ({ showForm: !state.showForm })),
  closeForm: () => set({ showForm: false }),
  setEditingId: (editingId) => set({ editingId }),
}))
