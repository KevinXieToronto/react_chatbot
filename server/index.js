// ⚠️ 必须是第一个 import：它负责加载 server/.env，后面的模块才能读到环境变量
import './env.js'

import express from 'express'
import cors from 'cors'
import { tasksRouter } from './routes/tasks.js'
import { chatRouter } from './routes/chat.js'
import { filesRouter } from './routes/files.js'
import { isMock } from './agent/openai.js'
import { workspaceRoot } from './agent/workspace.js'
import { createRequireToken, readServerToken } from './auth.js'

// ③ 服务端令牌（第 30 章）：没配就不启动。宁可启动不了，也不要"忘了配就裸奔"
let requireToken
try {
  requireToken = createRequireToken(readServerToken())
} catch (err) {
  console.error(`\n  ✖ TaskFlow 后端无法启动：${err.message}\n`)
  process.exit(1)
}

const PORT = Number(process.env.PORT ?? 3001)
// 默认只监听本机回环地址：同一个局域网里的其他机器连不上。
// 部署时才显式设 HOST=0.0.0.0（而且必须先有认证，见第 21 章）
const HOST = process.env.HOST ?? '127.0.0.1'

/** 读一个逗号分隔的环境变量，变成去掉空白的数组 */
function listFromEnv(name) {
  return (process.env[name] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

const app = express()

// ① Host 头白名单：防 DNS rebinding（第 21 章）
const allowedHosts = new Set([
  `localhost:${PORT}`,
  `127.0.0.1:${PORT}`,
  ...listFromEnv('ALLOWED_HOSTS'),
])
app.use((req, res, next) => {
  const host = (req.headers.host ?? '').toLowerCase()
  if (!allowedHosts.has(host)) {
    return res.status(403).json({ message: `不允许的 Host：${host}` })
  }
  next()
})

// ② CORS 白名单：只有这些网页能从浏览器里【跨域】调用我们。
//    走 Vite 代理的请求在浏览器看来是同源的，不受 CORS 影响；
//    这里管的是生产环境前端直接调后端域名的情况（第 20 章的 VITE_API_BASE_URL）
const allowedOrigins = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  ...listFromEnv('CORS_ORIGINS'),
])
app.use(
  cors({
    origin(origin, callback) {
      // 没有 Origin 头的请求（curl、服务器之间的调用）不归 CORS 管，放行
      callback(null, !origin || allowedOrigins.has(origin))
    },
  }),
)

app.use(express.json({ limit: '1mb' }))

// 极简的请求日志，开发时很有用
app.use((req, _res, next) => {
  console.log(`${req.method} ${req.url}`)
  next()
})

// ③ 除了 /health，所有接口都要令牌。/chat 包括了 /chat/approvals/:id
app.use('/tasks', requireToken, tasksRouter)
app.use('/chat', requireToken, chatRouter)
app.use('/files', requireToken, filesRouter)

// 健康检查不要令牌：只回答"活着没有、是不是 Mock"，不泄露任何数据
app.get('/health', (_req, res) => {
  res.json({ ok: true, mock: isMock() })
})

app.listen(PORT, HOST, () => {
  console.log(`\n  TaskFlow 后端已启动：http://localhost:${PORT}`)
  console.log(`  监听地址：${HOST}${HOST === '127.0.0.1' ? '（只有本机能访问）' : ''}`)
  console.log(`  模式：${isMock() ? 'Mock（不调用真实 API）' : '真实 OpenAI API'}`)
  console.log(`  代码助手工作区：${workspaceRoot()}`)
  console.log('  调用接口需要请求头 x-taskflow-token（值在 server/.env 里）\n')
})
