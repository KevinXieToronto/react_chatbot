import http from 'node:http'
import type { AddressInfo } from 'node:net'

export interface FakeServer {
  url: string
  /** 收到的每次 /chat 请求：模式和最后一句话 */
  requests: { mode: string; text: string }[]
  /** 收到的每次审批回答 */
  decisions: { approvalId: string; decision: string; note: string }[]
  close: () => Promise<void>
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function readJson(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  let text = ''
  for await (const chunk of req) text += chunk
  return text ? (JSON.parse(text) as Record<string, unknown>) : {}
}

/**
 * 一个进程内的假后端：说的是和真服务端一样的 SSE 协议，但剧本是写死的，
 * 所以端到端测试不依赖 Mock 模式的关键词、不依赖 workspace 里的文件，每次结果都一样。
 *
 *   最后一句话里有"改文件" → 发一次带 diff 的审批，等 POST /chat/approvals/:id
 *   其他                   → 流式回复一句带 Markdown 的话
 */
export async function startFakeServer(): Promise<FakeServer> {
  const requests: FakeServer['requests'] = []
  const decisions: FakeServer['decisions'] = []
  const waiting = new Map<string, (decision: string) => void>()

  const server = http.createServer(async (req, res) => {
    const body = await readJson(req)

    if (req.method === 'POST' && req.url === '/chat') {
      const messages = body.messages as { content: string }[]
      const text = messages[messages.length - 1]?.content ?? ''
      requests.push({ mode: String(body.mode), text })

      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8' })
      const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)

      if (text.includes('改文件')) {
        send('tool_start', { id: 't1', name: 'edit_file', input: { path: 'a.js' } })
        send('approval_required', {
          approvalId: 'ap1',
          toolUseId: 't1',
          name: 'edit_file',
          input: { path: 'a.js' },
          reason: '会修改文件 a.js',
          timeoutMs: 60_000,
          preview: {
            path: 'a.js',
            isNew: false,
            additions: 1,
            deletions: 1,
            tooLarge: false,
            hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ['-let x = 1', '+let x = 2'] }],
          },
        })
        const decision = await new Promise<string>((resolve) => waiting.set('ap1', resolve))
        send('approval_resolved', { approvalId: 'ap1', toolUseId: 't1', decision, by: 'user' })
        send('tool_end', { id: 't1', ok: decision === 'allow', summary: decision === 'allow' ? '已修改 a.js' : '已拒绝' })
        send('delta', { text: decision === 'allow' ? '改好了。' : '好的，不改了。' })
      } else {
        for (const piece of ['你好，', '这里是**假后端**', '。']) {
          send('delta', { text: piece })
          await sleep(20)
        }
      }
      send('done', { stopReason: 'end_turn' })
      res.end()
      return
    }

    const approval = req.url?.match(/^\/chat\/approvals\/([^/]+)$/)
    if (req.method === 'POST' && approval) {
      const approvalId = decodeURIComponent(approval[1])
      const resolve = waiting.get(approvalId)
      if (!resolve) {
        res.writeHead(404, { 'Content-Type': 'application/json' }).end(JSON.stringify({ message: '审批不存在或已过期' }))
        return
      }
      waiting.delete(approvalId)
      decisions.push({ approvalId, decision: String(body.decision), note: String(body.note ?? '') })
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true }))
      resolve(String(body.decision))
      return
    }

    res.writeHead(404).end()
  })

  // 端口 0：让系统随便挑一个空闲端口，不会和你正在跑的后端（3001）撞上
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo

  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    decisions,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  }
}
