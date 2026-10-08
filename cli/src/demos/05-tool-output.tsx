import { spawn } from 'node:child_process'
import path from 'node:path'
import { useEffect, useState } from 'react'
import { render, useApp } from 'ink'
import type { ToolCall } from '@taskflow/agent-core'
import { ToolLine } from '../components/ToolLine'
import { appendOutput } from '../outputTail'

/** 第 32 章 workspace 里那个会慢慢打印、带进度条的"假构建" */
const WORKSPACE = path.resolve(import.meta.dirname, '../../../workspace')

/**
 * 不经过后端，直接在本机跑一遍 workspace 的构建脚本，
 * 把输出喂给 ToolLine —— 和收到服务端的 tool_output 事件是一回事。
 */
function Demo() {
  const { exit } = useApp()
  const [output, setOutput] = useState('')
  const [call, setCall] = useState<ToolCall>({
    id: 'demo',
    name: 'run_command',
    input: { command: 'npm run build' },
    status: 'running',
  })

  useEffect(() => {
    const child = spawn(process.execPath, ['scripts/build.js'], { cwd: WORKSPACE })
    const onData = (chunk: Buffer) => setOutput((prev) => appendOutput(prev, chunk.toString('utf8')))
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.on('close', (code) => {
      setCall((c) => ({ ...c, status: code === 0 ? 'success' : 'error', summary: `退出码 ${code}` }))
    })
    return () => {
      child.kill()
    }
  }, [])

  useEffect(() => {
    if (call.status !== 'running') exit()
  }, [call.status, exit])

  return <ToolLine call={call} output={output} />
}

render(<Demo />)
