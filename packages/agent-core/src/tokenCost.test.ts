import { describe, it, expect } from 'vitest'
import { estimateCost, cacheHitRate } from './tokenCost'

// 价格是 tokenCost.ts 里的占位值（输入 $5 / 输出 $25，读缓存 0.1 倍）。改成真实价格后，这里的数字跟着改
describe('estimateCost', () => {
  it('各种 token 各按各的价格', () => {
    // 100 万输入 $5 + 100 万输出 $25
    expect(estimateCost({ input: 1e6, output: 1e6 })).toBeCloseTo(30)
    // 读缓存是输入价的 0.1 倍；OpenAI 写缓存不加价，按普通输入价
    expect(estimateCost({ input: 0, output: 0, cacheRead: 1e6 })).toBeCloseTo(0.5)
    expect(estimateCost({ input: 0, output: 0, cacheWrite: 1e6 })).toBeCloseTo(5)
  })

  it('同样 10 万输入 token，九成命中缓存时便宜很多', () => {
    const noCache = estimateCost({ input: 100_000, output: 0 })
    const cached = estimateCost({ input: 10_000, output: 0, cacheRead: 90_000 })
    expect(cached).toBeLessThan(noCache / 3)
  })
})

describe('cacheHitRate', () => {
  it('读取 / 全部输入', () => {
    expect(cacheHitRate({ input: 20, output: 0, cacheRead: 80 })).toBeCloseTo(0.8)
    expect(cacheHitRate({ input: 0, output: 0 })).toBe(0)
  })
})
