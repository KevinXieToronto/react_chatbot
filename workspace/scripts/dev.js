// 一个"假开发服务器"：启动后永远不会自己退出，
// 用来演示停止 / 超时时整棵进程树被杀掉（第 32 章）。
import http from 'node:http'

const PORT = 5199
const time = () => new Date().toLocaleTimeString()

const server = http.createServer((req, res) => {
  console.log(`\x1b[36m${time()}\x1b[39m ${req.method} ${req.url}`)
  res.end('demo-utils dev server\n')
})

// 只监听本机：一个演示用的服务器，没有理由让局域网里的其他电脑也能访问
server.listen(PORT, '127.0.0.1', () => {
  console.log(`\x1b[32m➜\x1b[39m  开发服务器已启动：http://localhost:${PORT}`)
})

let n = 0
setInterval(() => {
  n += 1
  console.log(`\x1b[2m${time()}\x1b[22m 监听文件变化中…（第 ${n} 秒）`)
}, 1000)
