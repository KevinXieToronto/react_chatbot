import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import EmptyState from './EmptyState'

describe('EmptyState', () => {
  it('显示标题', () => {
    render(<EmptyState title="还没有任务" />)
    expect(screen.getByText('还没有任务')).toBeInTheDocument()
  })

  it('有描述时显示描述', () => {
    render(<EmptyState title="标题" description="点击新建" />)
    expect(screen.getByText('点击新建')).toBeInTheDocument()
  })

  it('没有描述时不渲染描述元素', () => {
    render(<EmptyState title="标题" />)
    // 注意这里用 queryBy，因为我们断言的是"不存在"。
    // 用 getBy 的话找不到元素会直接抛错，断言根本执行不到。
    expect(screen.queryByText('点击新建')).not.toBeInTheDocument()
  })
})
