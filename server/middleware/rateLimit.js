/**
 * 极简的内存限流。
 *
 * ⚠️ 只适用于单实例。多实例部署要用 Redis，
 *    真实项目建议直接用 express-rate-limit。
 *    这里手写是为了让你看清楚原理。
 *
 * ⚠️ 按 req.ip 计数。部署到反向代理（Nginx、云平台的负载均衡）后面时，
 *    req.ip 拿到的是【代理】的地址 —— 所有用户共用一个计数桶，一个人刷满了大家一起被限。
 *    这时要在 server/index.js 里加 app.set('trust proxy', 1)，让 Express 从
 *    X-Forwarded-For 里取真实 IP。但只有确实在代理后面才能开：直接暴露在公网时开了它，
 *    客户端自己伪造一个 X-Forwarded-For 头就能每次换一个"IP"，限流形同虚设。
 */
const buckets = new Map()

export function rateLimit({ windowMs = 60_000, max = 20 } = {}) {
  return (req, res, next) => {
    const key = req.ip ?? 'unknown'
    const now = Date.now()

    const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs)

    if (hits.length >= max) {
      const retryAfter = Math.ceil((windowMs - (now - hits[0])) / 1000)
      res.setHeader('Retry-After', String(retryAfter))
      return res.status(429).json({
        kind: 'retryable',
        message: `请求太频繁了，${retryAfter} 秒后再试`,
      })
    }

    hits.push(now)
    buckets.set(key, hits)
    next()
  }
}

// 定期清理，防止内存无限增长
setInterval(() => {
  const now = Date.now()
  for (const [key, hits] of buckets) {
    const alive = hits.filter((t) => now - t < 60_000)
    if (alive.length === 0) buckets.delete(key)
    else buckets.set(key, alive)
  }
}, 60_000).unref() // unref 让这个定时器不阻止进程退出
