import { describe, it, expect, beforeEach } from 'vitest'
import { simulateUsage, resetCacheSimulator } from './cacheSimulator.js'
import { buildRequest } from './context.js'

// 一段够长的 system（超过 OpenAI 1024 token 的最小缓存长度）
const SYSTEM = '你是一个助手。'.repeat(200)
const request = (messages) => buildRequest({ system: SYSTEM, tools: [], messages })
const cached = (usage) => usage.prompt_tokens_details.cached_tokens

describe('simulateUsage（Mock 的缓存模拟，按 OpenAI 的规则）', () => {
  beforeEach(() => {
    resetCacheSimulator()
  })

  it('第一次请求没有命中，同样的请求再发一次，按 128 token 一档命中', () => {
    const params = request([{ role: 'user', content: '你好' }])
    const first = simulateUsage(params, '', 0)
    expect(first.prompt_tokens).toBeGreaterThan(1024)
    expect(cached(first)).toBe(0)

    const second = simulateUsage(params, '', 1000)
    expect(cached(second)).toBe(Math.floor(first.prompt_tokens / 128) * 128)
    expect(cached(second) % 128).toBe(0)
  })

  it('对话往后接着说：上一次的整个请求都是这一次的前缀', () => {
    const history = [{ role: 'user', content: '你好' }]
    const first = simulateUsage(request(history), '', 0)
    const second = simulateUsage(
      request([...history, { role: 'assistant', content: '你好！' }, { role: 'user', content: '再见' }]),
      '',
      1000,
    )
    expect(cached(second)).toBe(Math.floor(first.prompt_tokens / 128) * 128)
    expect(second.prompt_tokens).toBeGreaterThan(cached(second))
  })

  it('改了早期的消息，前缀就断了：只剩 system 那段能命中', () => {
    const first = simulateUsage(request([{ role: 'user', content: '你好' }]), '', 0)
    const edited = simulateUsage(request([{ role: 'user', content: '您好' }]), '', 1000)
    expect(cached(edited)).toBeGreaterThan(0)
    expect(cached(edited)).toBeLessThan(first.prompt_tokens)
  })

  it('5 分钟没用就过期了', () => {
    const params = request([{ role: 'user', content: '你好' }])
    simulateUsage(params, '', 0)
    expect(cached(simulateUsage(params, '', 6 * 60 * 1000))).toBe(0)
  })

  it('不到 1024 token 的请求不缓存', () => {
    const tiny = buildRequest({ system: '短', tools: [], messages: [{ role: 'user', content: 'hi' }] })
    simulateUsage(tiny, '', 0)
    expect(cached(simulateUsage(tiny, '', 1000))).toBe(0)
  })
})
