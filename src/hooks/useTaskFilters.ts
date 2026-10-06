import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { parseFilters, parseKeyword, serializeFilters } from '../lib/filterParams'
import type { TaskFilters } from '../types/filter'
import { DEFAULT_FILTERS } from '../types/filter'

/**
 * 把 URL 查询参数当作筛选条件的唯一数据源。
 * 不额外存一份 state，也就不存在"两份数据不同步"的问题。
 */
export function useTaskFilters() {
  const [searchParams, setSearchParams] = useSearchParams()

  // URL → 状态：每次渲染直接派生，不用 useState + useEffect 同步
  const filters = useMemo(() => parseFilters(searchParams), [searchParams])
  const keyword = useMemo(() => parseKeyword(searchParams), [searchParams])

  function setFilters(next: TaskFilters) {
    // replace: true —— 筛选是高频操作，不该往历史栈里塞一堆记录
    setSearchParams(serializeFilters(next, keyword), { replace: true })
  }

  function setKeyword(next: string) {
    setSearchParams(serializeFilters(filters, next), { replace: true })
  }

  function reset() {
    setSearchParams(new URLSearchParams(), { replace: true })
  }

  const isDefault =
    keyword.trim() === '' &&
    filters.status === DEFAULT_FILTERS.status &&
    filters.priority === DEFAULT_FILTERS.priority &&
    filters.sortBy === DEFAULT_FILTERS.sortBy &&
    filters.sortOrder === DEFAULT_FILTERS.sortOrder

  return { filters, keyword, setFilters, setKeyword, reset, isDefault }
}
