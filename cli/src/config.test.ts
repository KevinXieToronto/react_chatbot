import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveConfig } from './config'

/** 一个临时的 TASKFLOW_HOME，可以往里放 config.json */
function home(config?: unknown): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskflow-cfg-'))
  if (config !== undefined) {
    fs.writeFileSync(path.join(dir, 'config.json'), typeof config === 'string' ? config : JSON.stringify(config))
  }
  return dir
}

describe('resolveConfig', () => {
  it('什么都没配：默认值', () => {
    expect(resolveConfig([], { TASKFLOW_HOME: home() })).toEqual({
      kind: 'run',
      config: { apiUrl: 'http://localhost:3001', mode: 'tasks' },
    })
  })

  it('优先级：--api-url > TASKFLOW_API_URL > 配置文件', () => {
    const dir = home({ apiUrl: 'http://from-file:1', mode: 'code' })
    const env = { TASKFLOW_HOME: dir, TASKFLOW_API_URL: 'http://from-env:2' }

    expect(resolveConfig(['--api-url', 'http://from-flag:3/'], env)).toEqual({
      kind: 'run',
      config: { apiUrl: 'http://from-flag:3', mode: 'code' }, // 结尾的 / 被去掉了
    })
    expect(resolveConfig([], env)).toMatchObject({ config: { apiUrl: 'http://from-env:2' } })
    expect(resolveConfig([], { TASKFLOW_HOME: dir })).toMatchObject({ config: { apiUrl: 'http://from-file:1' } })
    // --token 只带回命令行给的值；没给就是 undefined（环境变量和 server/.env 由 token.ts 去找）
    expect(resolveConfig(['--token', 'abc'], env)).toMatchObject({ config: { token: 'abc' } })
    expect(resolveConfig([], env)).toMatchObject({ config: { token: undefined } })
  })

  it('--help、--version', () => {
    expect(resolveConfig(['-h'], { TASKFLOW_HOME: home() })).toEqual({ kind: 'help' })
    expect(resolveConfig(['--version'], { TASKFLOW_HOME: home() })).toEqual({ kind: 'version' })
  })

  it('写错了要说清楚：未知参数、错误的地址、坏掉的配置文件、不存在的模式', () => {
    const ok = { TASKFLOW_HOME: home() }
    expect(resolveConfig(['--port', '1'], ok)).toMatchObject({ kind: 'error' })
    expect(resolveConfig(['--api-url', 'localhost:3001'], ok)).toMatchObject({
      kind: 'error',
      message: expect.stringContaining('要以 http:// 或 https:// 开头'),
    })
    expect(resolveConfig([], { TASKFLOW_HOME: home('{ 坏了') })).toMatchObject({
      kind: 'error',
      message: expect.stringContaining('不是合法的 JSON'),
    })
    expect(resolveConfig(['--mode', 'root'], ok)).toMatchObject({ kind: 'error' })
  })
})
