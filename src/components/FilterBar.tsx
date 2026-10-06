import { memo } from 'react'
import type { TaskFilters, SortBy } from '../types/filter'
import { DEFAULT_FILTERS, SORT_LABELS } from '../types/filter'
import { PRIORITY_META, STATUS_META } from '../types/task'

interface FilterBarProps {
  filters: TaskFilters
  onChange: (filters: TaskFilters) => void
}

// memo 包裹：filters 和 onChange 都稳定时，列表刷新不会带着它一起重渲染
const FilterBar = memo(function FilterBar({ filters, onChange }: FilterBarProps) {
  function update<K extends keyof TaskFilters>(key: K, value: TaskFilters[K]) {
    onChange({ ...filters, [key]: value })
  }

  const isDefault =
    filters.status === DEFAULT_FILTERS.status &&
    filters.priority === DEFAULT_FILTERS.priority &&
    filters.sortBy === DEFAULT_FILTERS.sortBy &&
    filters.sortOrder === DEFAULT_FILTERS.sortOrder

  const selectClass =
    'rounded border border-slate-300 bg-white px-2 py-1 text-sm outline-none focus:border-blue-500'

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3">
      <label className="text-sm text-slate-600">
        状态
        <select
          value={filters.status}
          onChange={(e) => update('status', e.target.value as TaskFilters['status'])}
          className={`ml-1 ${selectClass}`}
        >
          <option value="all">全部</option>
          {Object.entries(STATUS_META).map(([value, meta]) => (
            <option key={value} value={value}>
              {meta.label}
            </option>
          ))}
        </select>
      </label>

      <label className="text-sm text-slate-600">
        优先级
        <select
          value={filters.priority}
          onChange={(e) => update('priority', e.target.value as TaskFilters['priority'])}
          className={`ml-1 ${selectClass}`}
        >
          <option value="all">全部</option>
          {Object.entries(PRIORITY_META).map(([value, meta]) => (
            <option key={value} value={value}>
              {meta.label}
            </option>
          ))}
        </select>
      </label>

      <label className="text-sm text-slate-600">
        排序
        <select
          value={filters.sortBy}
          onChange={(e) => update('sortBy', e.target.value as SortBy)}
          className={`ml-1 ${selectClass}`}
        >
          {Object.entries(SORT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        onClick={() => update('sortOrder', filters.sortOrder === 'asc' ? 'desc' : 'asc')}
        title={filters.sortOrder === 'asc' ? '升序' : '降序'}
        className="rounded border border-slate-300 bg-white px-2 py-1 text-sm hover:bg-slate-50"
      >
        {filters.sortOrder === 'asc' ? '↑' : '↓'}
      </button>

      {!isDefault && (
        <button
          type="button"
          onClick={() => onChange(DEFAULT_FILTERS)}
          className="ml-auto rounded px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
        >
          重置筛选
        </button>
      )}
    </div>
  )
})

export default FilterBar
