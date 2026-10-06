import type { Priority, Status } from './task'

/** 'all' 表示不筛选 */
export type StatusFilter = Status | 'all'
export type PriorityFilter = Priority | 'all'

export type SortBy = 'createdAt' | 'priority' | 'title'
export type SortOrder = 'asc' | 'desc'

export interface TaskFilters {
  status: StatusFilter
  priority: PriorityFilter
  sortBy: SortBy
  sortOrder: SortOrder
}

export const DEFAULT_FILTERS: TaskFilters = {
  status: 'all',
  priority: 'all',
  sortBy: 'createdAt',
  sortOrder: 'desc',
}

export const SORT_LABELS: Record<SortBy, string> = {
  createdAt: '创建时间',
  priority: '优先级',
  title: '标题',
}
