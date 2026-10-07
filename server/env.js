import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'

// 显式指定路径：dotenv 默认只在【进程的工作目录】找 .env —— 我们从项目根目录执行
// `node server/index.js`，工作目录是项目根，而文件在 server/.env，找不到。
const here = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.join(here, '.env') })
