import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_FILTERS } from '../types/filter'
import type { TaskFilters } from '../types/filter'

interface UIState {
  keyword: string
  filters: TaskFilters
  showForm: boolean
  editingId: string | null
}

interface UIActions {
  setKeyword: (keyword: string) => void
  setFilters: (filters: TaskFilters) => void
  resetFilters: () => void
  toggleForm: () => void
  closeForm: () => void
  setEditingId: (id: string | null) => void
}

export const useUIStore = create<UIState & UIActions>()(
  persist(
    (set) => ({
      keyword: '',
      filters: DEFAULT_FILTERS,
      showForm: false,
      editingId: null,

      setKeyword: (keyword) => set({ keyword }),
      setFilters: (filters) => set({ filters }),
      resetFilters: () => set({ filters: DEFAULT_FILTERS }),
      toggleForm: () => set((state) => ({ showForm: !state.showForm })),
      closeForm: () => set({ showForm: false }),
      setEditingId: (editingId) => set({ editingId }),
    }),
    {
      name: 'taskflow:ui',
      version: 1,
      // 只持久化筛选条件。
      // keyword / showForm / editingId 是临时状态，存下来下次打开会很怪。
      partialize: (state) => ({ filters: state.filters }),
    },
  ),
)
