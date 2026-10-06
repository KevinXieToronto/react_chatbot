import { describe, it, expect } from 'vitest'
import { processTasks } from './taskUtils'
import { DEFAULT_FILTERS } from '../types/filter'
import type { Task } from '../types/task'

/** 造测试数据的辅助函数，减少每个用例里的噪音 */
function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: crypto.randomUUID(),
    title: '默认标题',
    description: '',
    priority: 'medium',
    status: 'todo',
    createdAt: '2026-09-15T00:00:00.000Z',
    ...overrides,
  }
}

describe('processTasks', () => {
  const tasks: Task[] = [
    makeTask({ id: '1', title: '写周报', priority: 'high', status: 'doing', createdAt: '2026-09-15T00:00:00.000Z' }),
    makeTask({ id: '2', title: '修 bug', description: '登录页样式', priority: 'low', status: 'done', createdAt: '2026-09-16T00:00:00.000Z' }),
    makeTask({ id: '3', title: '开会', priority: 'medium', status: 'todo', createdAt: '2026-09-17T00:00:00.000Z' }),
  ]

  it('没有筛选条件时返回全部', () => {
    expect(processTasks(tasks, '', DEFAULT_FILTERS)).toHaveLength(3)
  })

  it('按标题搜索', () => {
    const result = processTasks(tasks, '周报', DEFAULT_FILTERS)
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('写周报')
  })

  it('搜索也匹配描述', () => {
    const result = processTasks(tasks, '登录页', DEFAULT_FILTERS)
    expect(result.map((t) => t.id)).toEqual(['2'])
  })

  it('搜索忽略大小写和首尾空格', () => {
    expect(processTasks(tasks, '  周报  ', DEFAULT_FILTERS)).toHaveLength(1)
  })

  it('按状态筛选', () => {
    const result = processTasks(tasks, '', { ...DEFAULT_FILTERS, status: 'done' })
    expect(result.map((t) => t.id)).toEqual(['2'])
  })

  it('状态和优先级筛选同时生效（是"与"不是"或"）', () => {
    const result = processTasks(tasks, '', {
      ...DEFAULT_FILTERS,
      status: 'todo',
      priority: 'high',
    })
    // id=1 是 high 但状态是 doing；id=3 是 todo 但优先级是 medium。都不满足
    expect(result).toHaveLength(0)
  })

  it('按优先级降序排列', () => {
    const result = processTasks(tasks, '', {
      ...DEFAULT_FILTERS,
      sortBy: 'priority',
      sortOrder: 'desc',
    })
    expect(result.map((t) => t.priority)).toEqual(['high', 'medium', 'low'])
  })

  it('按创建时间升序排列', () => {
    const result = processTasks(tasks, '', {
      ...DEFAULT_FILTERS,
      sortBy: 'createdAt',
      sortOrder: 'asc',
    })
    expect(result.map((t) => t.id)).toEqual(['1', '2', '3'])
  })

  it('不修改传入的数组（纯函数）', () => {
    const original = [...tasks]
    processTasks(tasks, '', { ...DEFAULT_FILTERS, sortBy: 'title' })
    expect(tasks).toEqual(original)
  })

  it('空数组不会崩', () => {
    expect(processTasks([], '任意', DEFAULT_FILTERS)).toEqual([])
  })
})
