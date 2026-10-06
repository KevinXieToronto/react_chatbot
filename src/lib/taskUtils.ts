import type { Priority, Task } from '../types/task'
import type { TaskFilters } from '../types/filter'

/** 优先级的排序权重 */
const PRIORITY_WEIGHT: Record<Priority, number> = { low: 0, medium: 1, high: 2 }

/**
 * 按关键词 + 筛选条件 + 排序处理任务列表。
 * 纯函数：同样的输入永远给同样的输出，不修改入参。
 */
export function processTasks(tasks: Task[], keyword: string, filters: TaskFilters): Task[] {
  const kw = keyword.trim().toLowerCase()

  const filtered = tasks.filter((task) => {
    if (kw && !task.title.toLowerCase().includes(kw) && !task.description.toLowerCase().includes(kw)) {
      return false
    }
    if (filters.status !== 'all' && task.status !== filters.status) return false
    if (filters.priority !== 'all' && task.priority !== filters.priority) return false
    return true
  })

  // toSorted 返回新数组，不会修改 filtered（filtered 本来也是新数组，但保持习惯）
  const sorted = filtered.toSorted((a, b) => {
    let diff = 0
    switch (filters.sortBy) {
      case 'priority':
        diff = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority]
        break
      case 'title':
        // localeCompare 让中文按拼音排序
        diff = a.title.localeCompare(b.title, 'zh-CN')
        break
      case 'createdAt':
        diff = a.createdAt.localeCompare(b.createdAt)
        break
    }
    return filters.sortOrder === 'asc' ? diff : -diff
  })

  return sorted
}
