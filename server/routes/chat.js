import { Router } from 'express'
import { getClient, isMock, MODEL, SYSTEM_PROMPT } from '../agent/claude.js'
import { validateMessages } from '../validate.js'

export const chatRouter = Router()

/** Mock 模式的假回复：根据用户说了什么给一段像样的话 */
function mockReply(userText) {
  const t = String(userText ?? '')
  if (t.includes('你好') || t.includes('hi') || t.toLowerCase().includes('hello')) {
    return '你好！我是 TaskFlow Copilot。我可以帮你查看、创建和更新任务。试试问我"我还有哪些任务没做完"。'
  }
  if (t.includes('任务') || t.includes('待办')) {
    return '（Mock 模式）我现在还不能真的读取你的任务数据 —— 那是第 25 章要实现的工具调用。不过这条回复本身走的是完整的真实链路：前端 → BFF → 回来。'
  }
  return `（Mock 模式）我收到了你的消息："${t.slice(0, 60)}"。\n\n要切换到真实的 Claude，把 server/.env 里的 MOCK 改成 0 并填上 ANTHROPIC_API_KEY。`
}

chatRouter.post('/', async (req, res) => {
  const { messages } = req.body ?? {}

  const invalid = validateMessages(messages)
  if (invalid) return res.status(400).json({ message: invalid })

  // ── Mock 分支 ──────────────────────────────
  if (isMock()) {
    // 加一点延迟，模拟真实网络，方便看到 loading 状态
    await new Promise((r) => setTimeout(r, 600))
    // 校验过了，最后一条一定是用户消息
    const lastUser = messages.at(-1)
    return res.json({
      text: mockReply(lastUser.content),
      usage: { input_tokens: 0, output_tokens: 0 },
      stopReason: 'end_turn',
      mock: true,
    })
  }

  // ── 真实 Claude 分支 ────────────────────────
  try {
    const client = getClient()

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      // 只把 role 和 content 传给 API，前端可能带了别的字段（id、时间戳）
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    })

    // ⚠️ 安全分类器可能拒绝回答，这时 HTTP 是 200 但 stop_reason 是 refusal。
    //    必须先看 stop_reason 再读 content。
    if (response.stop_reason === 'refusal') {
      return res.json({
        text: '抱歉，这个请求我没法处理。',
        stopReason: 'refusal',
        usage: response.usage,
      })
    }

    // content 是一个数组（可能含 thinking / text / tool_use 多种块），
    // 要按 type 过滤出文本块。直接取 content[0].text 是错的。
    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')

    res.json({ text, usage: response.usage, stopReason: response.stop_reason })
  } catch (err) {
    console.error('[chat] 调用失败：', err)
    const status = err?.status ?? 500
    res.status(status).json({
      message: status === 401 ? 'API Key 无效' : '调用模型失败，请稍后再试',
    })
  }
})
