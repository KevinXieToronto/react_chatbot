import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import type { ChatMode } from '@taskflow/agent-core'
import { isMode } from './commands'
import { DEFAULT_API_URL } from './api'

export interface CliConfig {
  apiUrl: string
  mode: ChatMode
  /** 只有 --token 给的才在这里；环境变量和 server/.env 由 token.ts 去找 */
  token?: string
}

/** 配置文件的位置：和历史文件放在一起，C:\Users\你的用户名\.taskflow\config.json */
export function configDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.TASKFLOW_HOME ?? path.join(os.homedir(), '.taskflow')
}

export const HELP = `用法：taskflow [选项]

选项：
  --api-url <地址>   后端地址（默认 ${DEFAULT_API_URL}）
  --mode <模式>      启动时的模式：tasks | code | sdk（默认 tasks）
  --token <令牌>     访问令牌（默认读环境变量 TASKFLOW_TOKEN，其次 server/.env；
                     写在命令行里会留在历史记录里，平时用环境变量更稳妥）
  -v, --version      显示版本号
  -h, --help         显示这段帮助

后端地址的优先级：--api-url > 环境变量 TASKFLOW_API_URL > 配置文件 > 默认值
访问令牌的优先级：--token > 环境变量 TASKFLOW_TOKEN > server/.env 里的 TASKFLOW_TOKEN（不放配置文件）
配置文件：%USERPROFILE%\\.taskflow\\config.json，例如 { "apiUrl": "http://localhost:3001" }`

export type ResolveResult =
  | { kind: 'run'; config: CliConfig }
  | { kind: 'help' }
  | { kind: 'version' }
  | { kind: 'error'; message: string }

/** 读配置文件。不存在就当没有；存在但写坏了，要告诉用户（不像历史文件那样悄悄忽略） */
function readConfigFile(file: string): { apiUrl?: unknown; mode?: unknown } | string {
  let text: string
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch {
    return {}
  }
  try {
    const data: unknown = JSON.parse(text)
    return data && typeof data === 'object' ? data : {}
  } catch {
    return `配置文件 ${file} 不是合法的 JSON`
  }
}

function checkUrl(value: unknown, source: string): string | { error: string } {
  if (typeof value !== 'string' || !/^https?:\/\/\S+$/.test(value)) {
    return { error: `${source}里的后端地址不对：${String(value)}（要以 http:// 或 https:// 开头）` }
  }
  return value.replace(/\/+$/, '') // 去掉结尾的 /，拼接口地址时不会出现 //chat
}

/**
 * 命令行参数 + 环境变量 + 配置文件 → 最终配置。
 * 所有输入都从参数传进来（而不是直接读 process），所以测试时想怎么组合都行。
 */
export function resolveConfig(argv: string[], env: NodeJS.ProcessEnv = process.env): ResolveResult {
  let values: { 'api-url'?: string; mode?: string; token?: string; version?: boolean; help?: boolean }
  try {
    ;({ values } = parseArgs({
      args: argv,
      options: {
        'api-url': { type: 'string' },
        mode: { type: 'string' },
        token: { type: 'string' },
        version: { type: 'boolean', short: 'v' },
        help: { type: 'boolean', short: 'h' },
      },
      strict: true,
    }))
  } catch (err) {
    return { kind: 'error', message: `${err instanceof Error ? err.message : String(err)}\n\n${HELP}` }
  }

  if (values.help) return { kind: 'help' }
  if (values.version) return { kind: 'version' }

  const file = path.join(configDir(env), 'config.json')
  const fromFile = readConfigFile(file)
  if (typeof fromFile === 'string') return { kind: 'error', message: fromFile }

  // 优先级从高到低，第一个有值的胜出
  const [rawUrl, source] =
    values['api-url'] !== undefined
      ? [values['api-url'], '--api-url ']
      : env.TASKFLOW_API_URL
        ? [env.TASKFLOW_API_URL, '环境变量 TASKFLOW_API_URL ']
        : fromFile.apiUrl !== undefined
          ? [fromFile.apiUrl, `配置文件 ${file} `]
          : [DEFAULT_API_URL, '默认值']
  const apiUrl = checkUrl(rawUrl, source)
  if (typeof apiUrl !== 'string') return { kind: 'error', message: apiUrl.error }

  const mode = values.mode ?? fromFile.mode ?? 'tasks'
  if (typeof mode !== 'string' || !isMode(mode)) {
    return { kind: 'error', message: `没有 ${String(mode)} 这个模式，可选：tasks / code / sdk` }
  }

  return { kind: 'run', config: { apiUrl, mode, token: values.token } }
}
