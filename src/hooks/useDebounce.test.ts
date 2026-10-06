import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDebounce } from './useDebounce'

describe('useDebounce', () => {
  beforeEach(() => {
    // 用假定时器，这样不用真的等 300ms
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('初始值立刻返回', () => {
    const { result } = renderHook(() => useDebounce('hello', 300))
    expect(result.current).toBe('hello')
  })

  it('延迟时间内不更新', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 300), {
      initialProps: { value: 'a' },
    })

    rerender({ value: 'b' })
    expect(result.current).toBe('a') // 还没到时间

    // act 包住定时器推进，否则 React 会警告状态更新没被包裹
    act(() => {
      vi.advanceTimersByTime(299)
    })
    expect(result.current).toBe('a')

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current).toBe('b') // 刚好到 300ms
  })

  it('连续变化只取最后一次（这才是防抖的意义）', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 300), {
      initialProps: { value: 'a' },
    })

    rerender({ value: 'b' })
    act(() => vi.advanceTimersByTime(100))

    rerender({ value: 'c' })
    act(() => vi.advanceTimersByTime(100))

    rerender({ value: 'd' })
    act(() => vi.advanceTimersByTime(300))

    // b 和 c 都被"推迟"掉了，只有最后的 d 生效
    expect(result.current).toBe('d')
  })
})
