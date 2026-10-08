import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'

/** 后端（第 30 章起）要求每个请求都带的请求头 */
export const TOKEN_HEADER = 'x-taskflow-token'

/** 后端回 401 时，终端里显示的话 */
export const UNAUTHORIZED_MESSAGE =
  '后端拒绝了请求（401）：缺少或错误的访问令牌。请用 --token 参数、环境变量 TASKFLOW_TOKEN，或 server/.env 里的 TASKFLOW_TOKEN 提供令牌（和后端用的是同一个值）。'

/** server/.env 的可能位置：先按本文件的位置往上找，再按当前目录找 */
function defaultEnvFiles(): string[] {
  return [
    fileURLToPath(new URL('../../server/.env', import.meta.url)),
    join(process.cwd(), 'server', '.env'),
  ]
}

/**
 * 找访问令牌，优先级：参数 > 环境变量 TASKFLOW_TOKEN > server/.env 里的 TASKFLOW_TOKEN。
 * 都没有就返回 undefined（后端没开令牌校验时，不带也能用）。
 * 所有输入都从参数传进来，测试时想怎么组合都行。
 */
export function resolveToken(
  flag?: string,
  env: NodeJS.ProcessEnv = process.env,
  envFiles: string[] = defaultEnvFiles(),
): string | undefined {
  if (flag) return flag
  if (env.TASKFLOW_TOKEN) return env.TASKFLOW_TOKEN
  for (const file of envFiles) {
    try {
      const token = parseEnv(readFileSync(file, 'utf8')).TASKFLOW_TOKEN
      if (token) return token
    } catch {
      /* 文件不存在或读不了：试下一个位置 */
    }
  }
  return undefined
}
