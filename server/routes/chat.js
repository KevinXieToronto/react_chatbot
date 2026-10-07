import { Router } from 'express'
import { getClient, isMock, MODEL, SYSTEM_PROMPT } from '../agent/openai.js'
import { validateMessages } from '../validate.js'

export const chatRouter = Router()

/** 发一条 SSE 消息。注意结尾必须是两个换行。 */
function sse(res, event, data) {
  res.write(`event: ${event}\n`)
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

/** 设置 SSE 必需的响应头 */
function openStream(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    // HTTP/1.1 默认就是长连接，这行其实多余，留着是因为很多 SSE 示例都写它。
    // （HTTP/2 禁止这个头，不过反向代理转发时会自动去掉，不会出问题）
    Connection: 'keep-alive',
    // 关键：告诉 Nginx 之类的反向代理不要缓冲这个响应。
    // 不加这行，生产环境会出现"本地流式正常，上线后变成一次性返回"。
    'X-Accel-Buffering': 'no',
  })
  // 立刻把响应头发出去，别等第一个数据块
  res.flushHeaders?.()
}

function mockText(userText) {
  const t = String(userText ?? '')
  if (t.includes('你好') || t.toLowerCase().includes('hello')) {
    return '你好！我是 TaskFlow Copilot。我可以帮你查看、创建和更新任务。\n\n现在这段话是逐字流式输出的 —— 注意看它是一个字一个字出现的，而不是整段蹦出来。'
  }
  if (t.includes('任务') || t.includes('待办')) {
    return '（Mock 模式）真正读取任务数据要等到第 25 章的工具调用。\n\n不过这条回复走的是完整的流式链路：Express 用 SSE 推送，浏览器用 ReadableStream 解析，React 增量更新 state。整条链路和接真实 OpenAI 时一模一样。'
  }
  return `（Mock 模式）收到："${t.slice(0, 40)}"。\n\n这段文字正在被一个字一个字推送给你。要切到真实 OpenAI，改 server/.env 里的 MOCK=0 并填 OPENAI_API_KEY。`
}

/** Mock 的流式输出：把一段文字切成小块，隔一会儿发一块 */
async function streamMock(res, userText) {
  const text = mockText(userText)
  // 按字符发，模拟真实 token 流。每次发 1~3 个字，间隔 25ms
  let i = 0
  while (i < text.length) {
    const size = 1 + Math.floor(Math.random() * 3)
    const chunk = text.slice(i, i + size)
    i += size

    sse(res, 'delta', { text: chunk })
    await new Promise((r) => setTimeout(r, 25))

    // 客户端断开了就立刻停 —— 不然白白跑完整段
    if (res.writableEnded || res.destroyed) return false
  }
  return true
}

chatRouter.post('/', async (req, res) => {
  const { messages } = req.body ?? {}

  const invalid = validateMessages(messages)
  if (invalid) return res.status(400).json({ message: invalid })

  openStream(res)

  // 客户端断开（用户关页面、点了停止）时收到这个事件。
  // ⚠️ 用 res.on('close')，不是 req.on('close')：req 是【请求体】的可读流，
  //    请求体读完（几乎是进入这个处理函数的同时）它就会触发 close，
  //    和客户端有没有断开完全无关。res.on('close') 才是响应/连接真正关闭时触发。
  let aborted = false
  res.on('close', () => {
    // 正常 res.end() 结束时也会触发 close，这时 writableFinished 是 true —— 不算中断
    if (res.writableFinished) return
    aborted = true
    console.log('[chat] 客户端断开，停止生成')
  })

  try {
    // ── Mock 分支 ────────────────────────────
    if (isMock()) {
      const lastUser = messages.at(-1) // 校验过了，最后一条一定是用户消息
      await new Promise((r) => setTimeout(r, 300)) // 模拟首字延迟
      const finished = await streamMock(res, lastUser.content)
      if (finished && !aborted) {
        sse(res, 'done', { stopReason: 'end_turn', usage: { output_tokens: 0 } })
      }
      return res.end()
    }

    // ── 真实 OpenAI 分支 ──────────────────────
    const client = getClient()

    // 用户断开时同时取消对模型的请求 —— 省钱，也省服务器资源
    const controller = new AbortController()
    res.on('close', () => controller.abort())

    const stream = await client.chat.completions.create(
      {
        model: MODEL,
        max_completion_tokens: 16000,
        stream: true,
        // 流式默认不返回用量，要显式打开：最后会多一个 choices 为空、只带 usage 的数据块
        stream_options: { include_usage: true },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...messages.map((m) => ({ role: m.role, content: m.content })),
        ],
      },
      { signal: controller.signal },
    )

    let finishReason = null
    let refused = false
    let usage = null

    for await (const chunk of stream) {
      const choice = chunk.choices[0]
      if (choice) {
        // 每个数据块的 delta.content 就是文本增量
        if (choice.delta?.content) sse(res, 'delta', { text: choice.delta.content })
        // 模型拒绝回答时，内容走的是 delta.refusal 而不是 delta.content
        if (choice.delta?.refusal) refused = true
        if (choice.finish_reason) finishReason = choice.finish_reason
      }
      if (chunk.usage) usage = chunk.usage
    }

    if (refused || finishReason === 'content_filter') {
      sse(res, 'error', { message: '抱歉，这个请求我没法处理。' })
    } else {
      sse(res, 'done', {
        stopReason: finishReason,
        // 换算成前端已经在用的 usage 形状
        usage: {
          input_tokens: usage?.prompt_tokens ?? 0,
          output_tokens: usage?.completion_tokens ?? 0,
        },
      })
    }

    res.end()
  } catch (err) {
    // 客户端断开后 controller.abort() 会让 for await 抛 APIUserAbortError。
    // 这是我们自己取消的，不是错误：不打日志，也别往已经关闭的连接里写东西
    if (aborted) return

    console.error('[chat] 出错：', err)
    // ⚠️ 响应头已经发出去了，不能再改状态码。
    //    只能通过 SSE 的 error 事件告诉前端。
    if (!res.writableEnded) {
      sse(res, 'error', { message: err?.status === 401 ? 'API Key 无效' : '调用模型失败' })
      res.end()
    }
  }
})
