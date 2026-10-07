import { describe, it, expect, vi } from 'vitest'
import { createRequireToken, readServerToken, safeEqual } from './auth.js'

const TOKEN = 'a'.repeat(36)

/** 造一个最小的 req / res，只实现中间件用到的方法 */
function call(headerValue) {
  const req = { get: (name) => (name === 'x-taskflow-token' ? headerValue : undefined) }
  const res = {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code
      return this
    },
    json(body) {
      this.body = body
      return this
    },
  }
  const next = vi.fn()
  createRequireToken(TOKEN)(req, res, next)
  return { res, next }
}

describe('requireToken', () => {
  it('令牌正确：放行', () => {
    const { res, next } = call(TOKEN)
    expect(next).toHaveBeenCalledOnce()
    expect(res.statusCode).toBe(200)
  })

  it('没带令牌：401，不放行', () => {
    const { res, next } = call(undefined)
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(401)
  })

  it('长度不同的错误令牌：401，而不是抛异常', () => {
    // timingSafeEqual 遇到长度不同会抛 RangeError —— safeEqual 必须先挡住
    const { res, next } = call('short')
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(401)
  })

  it('长度相同但内容不同：401', () => {
    const { res } = call('b'.repeat(36))
    expect(res.statusCode).toBe(401)
  })
})

describe('safeEqual', () => {
  it('中文按字节比较，不会因为"字符数相同、字节数不同"而抛异常', () => {
    expect(safeEqual('令牌', 'ab')).toBe(false)
    expect(safeEqual('令牌', '令牌')).toBe(true)
  })
})

describe('readServerToken', () => {
  it('没有设置：抛出带提示的错误', () => {
    expect(() => readServerToken({})).toThrow(/TASKFLOW_TOKEN/)
  })

  it('太短（比如忘了换掉 .env 里的中文占位）：同样拒绝', () => {
    expect(() => readServerToken({ TASKFLOW_TOKEN: '把刚才生成的那一串粘贴在这里' })).toThrow(/至少 32 个字符/)
  })

  it('UUID：通过，并去掉首尾空白', () => {
    const uuid = '3f0c6a3e-8a52-4b7e-9c1d-2f4e6b8a9d10'
    expect(readServerToken({ TASKFLOW_TOKEN: ` ${uuid} ` })).toBe(uuid)
  })
})
