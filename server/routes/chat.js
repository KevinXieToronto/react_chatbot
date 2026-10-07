import { Router } from 'express'
import { isMock } from '../agent/openai.js'
import { runAgentLoop } from '../agent/loop.js'
import { getProfile } from '../agent/profiles.js'
import { createToolRunner } from '../agent/toolRunner.js'
import { openStream, sleep, sse } from '../agent/stream.js'
import { rateLimit } from '../middleware/rateLimit.js'
import { validateMessages } from '../validate.js'

export const chatRouter = Router()

const MAX_MESSAGES = 60
const MAX_CHARS = 20_000

/** 把各种异常映射成前端能理解的分类 */
function classifyError(err) {
  const status = err?.status

  if (status === 401) {
    return { kind: 'config', message: 'API Key 无效，请联系管理员' }
  }
  if (status === 403) {
    return { kind: 'config', message: '这个 API Key 没有权限使用该模型，请联系管理员' }
  }
  if (status === 404) {
    // 最常见的原因：OPENAI_MODEL 写错了，或者这个模型已经下线
    return { kind: 'config', message: '模型不存在，请检查 server/.env 里的 OPENAI_MODEL' }
  }
  if (status === 413) {
    return { kind: 'input', message: '内容太长了，请新建一个会话或缩短问题' }
  }
  if (status === 429) {
    return { kind: 'retryable', message: '请求太频繁，稍等一下再试' }
  }
  if (status === 400) {
    // 400 的原因很多（参数不合法、上下文超长……），别一律说成"太长了"
    return { kind: 'input', message: '模型 API 拒绝了这个请求，换个问法或新建一个会话试试' }
  }
  if (status >= 500 || err?.name === 'APIConnectionError') {
    return { kind: 'retryable', message: '服务暂时不可用，请重试' }
  }
  return { kind: 'retryable', message: '出错了，请重试' }
}

chatRouter.post('/', rateLimit({ windowMs: 60_000, max: 20 }), async (req, res) => {
  const { messages, mode = 'tasks' } = req.body ?? {}

  // mode 决定用哪套工具和提示词。只认白名单里的值。
  const profile = getProfile(mode)
  if (!profile) {
    return res.status(400).json({ kind: 'input', message: `不支持的模式：${mode}` })
  }

  // role 只能是 user / assistant，content 必须是字符串，最后一条是用户消息（第 21 章）
  const invalid = validateMessages(messages)
  if (invalid) return res.status(400).json({ kind: 'input', message: invalid })

  // 防止超长上下文把 token 烧光。
  // 真实项目应该做智能截断或摘要，这里先简单拒绝。
  if (messages.length > MAX_MESSAGES) {
    return res.status(400).json({
      kind: 'input',
      message: '对话太长了，请新建一个会话',
    })
  }

  // validateMessages 已经保证 content 都是字符串，.length 量的就是真实字数（第 28 章）
  const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0)
  if (totalChars > MAX_CHARS) {
    return res.status(400).json({
      kind: 'input',
      message: '内容太长了，请新建一个会话或缩短问题',
    })
  }

  openStream(res)

  const abort = new AbortController()
  // ⚠️ 用 res.on('close')，不是 req.on('close')：req 是请求体的可读流，请求体
  //    读完就会触发 close（几乎在进入这个处理函数的同时），和客户端是否断开无关。
  res.on('close', () => {
    if (res.writableFinished) return // 正常结束也会触发 close，不算中断
    console.log('[chat] 客户端断开，停止生成')
    abort.abort()
  })

  // 真实模式和 Mock 模式共用同一个工具执行器 → 推给前端的事件完全一致
  const callTool = createToolRunner(res, profile, abort.signal, {
    delayMs: isMock() ? 500 : 0,
  })

  try {
    if (isMock()) {
      const lastUser = [...messages].reverse().find((m) => m.role === 'user')
      await sleep(250)
      const finished = await profile.mock(
        { res, signal: abort.signal, callTool },
        lastUser?.content,
      )
      if (finished && !abort.signal.aborted) {
        sse(res, 'done', { stopReason: 'end_turn' })
      }
      return res.end()
    }

    const result = await runAgentLoop(
      messages,
      profile,
      {
        onText: (delta) => sse(res, 'delta', { text: delta }),
        callTool,
      },
      abort.signal,
    )

    if (abort.signal.aborted) return res.end()

    if (result.stopReason === 'refusal') {
      sse(res, 'error', { kind: 'input', message: '抱歉，这个请求我没法处理。换个问法试试？' })
    } else if (result.stopReason === 'truncated') {
      sse(res, 'error', { kind: 'input', message: '回复被长度限制截断了，请把问题拆小一点。' })
    } else if (result.stopReason === 'max_turns') {
      sse(res, 'error', { kind: 'input', message: '操作步骤太多，已停止。请把需求拆成几步分别说。' })
    } else {
      sse(res, 'done', { stopReason: result.stopReason, usage: result.usage })
    }

    res.end()
  } catch (err) {
    // 客户端断开导致的中止不是错误，安静地结束就好
    if (abort.signal.aborted) return res.end()

    console.error('[chat] 出错：', err)
    if (!res.writableEnded) {
      sse(res, 'error', classifyError(err))
      res.end()
    }
  }
})
