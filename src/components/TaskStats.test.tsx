import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderWithProviders, screen, waitFor } from '../test/renderWithProviders'
import TaskStats from './TaskStats'
import { taskApi } from '../api/taskApi'
import { taskKeys } from '../api/queryKeys'
import type { Task } from '../types/task'

// 把整个 api 模块替换成假的。
// 这样测试不依赖真实网络，快且稳定。
vi.mock('../api/taskApi')

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: crypto.randomUUID(),
    title: '任务',
    description: '',
    priority: 'medium',
    status: 'todo',
    createdAt: '2026-09-15T00:00:00.000Z',
    ...overrides,
  }
}

describe('TaskStats', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('显示总数、进行中、已完成', async () => {
    vi.mocked(taskApi.list).mockResolvedValue([
      makeTask({ status: 'todo' }),
      makeTask({ status: 'doing' }),
      makeTask({ status: 'done' }),
      makeTask({ status: 'done' }),
    ])

    renderWithProviders(<TaskStats />)

    // 数据是异步来的，必须用 findBy 等它
    expect(await screen.findByText('4')).toBeInTheDocument()   // 总数
    expect(screen.getByText('2')).toBeInTheDocument()          // 已完成
  })

  it('高优先级未完成时显示警告', async () => {
    vi.mocked(taskApi.list).mockResolvedValue([
      makeTask({ priority: 'high', status: 'todo' }),
      makeTask({ priority: 'high', status: 'done' }), // 已完成的不算
    ])

    renderWithProviders(<TaskStats />)

    expect(await screen.findByText(/1 个高优先级未完成/)).toBeInTheDocument()
  })

  it('没有任务时什么都不渲染', async () => {
    vi.mocked(taskApi.list).mockResolvedValue([])

    const { container, queryClient } = renderWithProviders(<TaskStats />)

    // 注意：查询还在加载时 TaskStats 也是什么都不渲染，所以光判断"空"是白过的。
    // 必须先等查询真的成功结束，再断言，这条用例才有意义。
    await waitFor(() =>
      expect(queryClient.getQueryState(taskKeys.lists())?.status).toBe('success'),
    )
    expect(container).toBeEmptyDOMElement()
  })
})
