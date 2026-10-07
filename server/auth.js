import crypto from 'node:crypto'

/** 请求头名字。Vite 代理（第 30 章）和终端客户端（第 35 章起）都发这个头 */
export const TOKEN_HEADER = 'x-taskflow-token'

const MIN_LENGTH = 32

/**
 * 从环境变量读令牌；没有或太短就抛错（index.js 据此拒绝启动）。
 * 写成函数、在调用时才读 process.env：和 isMock()、workspaceRoot() 一个道理（第 29 章）。
 */
export function readServerToken(env = process.env) {
  const token = String(env.TASKFLOW_TOKEN ?? '').trim()
  if (token.length < MIN_LENGTH) {
    throw new Error(
      'server/.env 里没有设置 TASKFLOW_TOKEN（或者太短，至少 32 个字符）。\n' +
        '    在项目根目录执行 node -p "crypto.randomUUID()"，\n' +
        '    把输出的那一串写进 server/.env：TASKFLOW_TOKEN=那一串',
    )
  }
  return token
}

/**
 * 常数时间比较两个字符串。
 * === 遇到第一个不同的字符就返回，响应时间会泄露"前几位猜对了没有"；timingSafeEqual 不会。
 */
export function safeEqual(given, expected) {
  const a = Buffer.from(String(given), 'utf8')
  const b = Buffer.from(String(expected), 'utf8')
  // ⚠️ timingSafeEqual 要求两个 Buffer 一样长，长度不同会直接抛 RangeError。
  //    长度不同肯定不相等；提前返回只泄露了"长度不对"，而令牌的长度本来就不是秘密。
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

/** Express 中间件：请求头里的令牌不对就 401 */
export function createRequireToken(expected) {
  return function requireToken(req, res, next) {
    const given = req.get(TOKEN_HEADER)
    if (typeof given !== 'string' || !safeEqual(given, expected)) {
      return res.status(401).json({ message: `缺少或错误的 ${TOKEN_HEADER} 请求头` })
    }
    next()
  }
}
