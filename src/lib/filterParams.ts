import { DEFAULT_FILTERS } from '../types/filter'
import type { TaskFilters, SortBy, SortOrder } from '../types/filter'
import type { Priority, Status } from '../types/task'

const STATUSES: Status[] = ['todo', 'doing', 'done']
const PRIORITIES: Priority[] = ['low', 'medium', 'high']
const SORT_BYS: SortBy[] = ['createdAt', 'priority', 'title']
const SORT_ORDERS: SortOrder[] = ['asc', 'desc']

/**
 * URL → 筛选条件。
 * 用户可能手动在地址栏乱输，所以每个值都要校验，非法值一律回退到默认。
 */
export function parseFilters(params: URLSearchParams): TaskFilters {
  const status = params.get('status')
  const priority = params.get('priority')
  const sortBy = params.get('sort')
  const sortOrder = params.get('order')

  return {
    status: STATUSES.includes(status as Status) ? (status as Status) : DEFAULT_FILTERS.status,
    priority: PRIORITIES.includes(priority as Priority)
      ? (priority as Priority)
      : DEFAULT_FILTERS.priority,
    sortBy: SORT_BYS.includes(sortBy as SortBy) ? (sortBy as SortBy) : DEFAULT_FILTERS.sortBy,
    sortOrder: SORT_ORDERS.includes(sortOrder as SortOrder)
      ? (sortOrder as SortOrder)
      : DEFAULT_FILTERS.sortOrder,
  }
}

/**
 * 筛选条件 + 关键词 → URL 参数。
 * 关键点：等于默认值的参数不写进 URL，保持地址简洁。
 * 不然默认状态下地址栏就是 /?status=all&priority=all&sort=createdAt&order=desc，很丑。
 */
export function serializeFilters(filters: TaskFilters, keyword: string): URLSearchParams {
  const params = new URLSearchParams()

  if (filters.status !== DEFAULT_FILTERS.status) params.set('status', filters.status)
  if (filters.priority !== DEFAULT_FILTERS.priority) params.set('priority', filters.priority)
  if (filters.sortBy !== DEFAULT_FILTERS.sortBy) params.set('sort', filters.sortBy)
  if (filters.sortOrder !== DEFAULT_FILTERS.sortOrder) params.set('order', filters.sortOrder)
  if (keyword.trim()) params.set('q', keyword.trim())

  return params
}

export function parseKeyword(params: URLSearchParams): string {
  return params.get('q') ?? ''
}
