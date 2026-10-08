import { Router } from 'express'
import { isMock, getClient, toUsage } from '../agent/openai.js'
import { runAgentLoop } from '../agent/loop.js'
import { buildRequest } from '../agent/context.js'
import { fitContext, createSummarizer, mockSummarize } from '../agent/contextManager.js'
import { simulateUsage } from '../agent/cacheSimulator.js'
import { createScriptedClient } from '../agent/scriptedClient.js'
import { runSdkAgent } from '../agent/sdkAgent.js'
import { createMockSdkModel } from '../agent/mockSdk.js'
import { getProfile } from '../agent/profiles.js'
import { createToolRunner } from '../agent/toolRunner.js'
import { openStream, sleep, sse } from '../agent/stream.js'
import { rateLimit } from '../middleware/rateLimit.js'
import { validateMessages } from '../validate.js'
import { resolveApproval, listPendingApprovals } from '../agent/approvals.js'

export const chatRouter = Router()

// 第 33 章起，真正的长度控制交给上下文管理（按 token 预算截断、摘要）。
// 这两个上限只是防滥用的"安全阀"：挡住明显不正常的请求体。
const MAX_MESSAGES = 200
const MAX_CHARS = 200_000

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

  // role 只能是 user / assistant，content 必须是字符串，最后一条是用户消息（第 21 章）。
  // 只收纯文本这一条在本章更要紧：工具调用、工具结果只能由服务端自己产生，
  // 否则客户端可以伪造一段"模型调过工具、工具返回了 xxx"的历史，上下文管理也会被它搅乱
  const invalid = validateMessages(messages)
  if (invalid) return res.status(400).json({ kind: 'input', message: invalid })

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

  const history = messages.map((m) => ({ role: m.role, content: m.content }))
  const lastUser = [...history].reverse().find((m) => m.role === 'user')

  // 几种跑法：
  //   SDK 引擎（mode: 'sdk'）—— OpenAI Agents SDK 跑循环（第 34 章），Mock 时给它换上脚本化的假模型
  //   真实模式 —— 真的 OpenAI + 真实循环
  //   Mock + 有剧本 —— 脚本化的假模型 + 真实循环（第 33 章，能看到上下文管理和缓存）
  //   Mock + 没剧本 —— 老的 Mock：剧本自己调工具，不经过循环
  const script = isMock() ? profile.mockScript?.(lastUser?.content) : null

  try {
    // 第 34 章：SDK 引擎。事件翻译、审批都在 runSdkAgent 里，done 也由它发；出错抛到下面的 catch
    if (profile.engine === 'sdk') {
      await runSdkAgent({
        messages: history,
        emit: (event, data) => sse(res, event, data),
        signal: abort.signal,
        // 没有 key 时换上假模型；有 key 时不传，用真正的 OpenAI 模型
        model: isMock() ? createMockSdkModel() : undefined,
      })
      return res.end()
    }

    if (isMock() && !script) {
      // 老的 Mock 不经过循环，这里手动做一遍上下文整理，让上下文条也有数字可看
      const fitted = await fitContext(history, profile, { client: null, summarize: mockSummarize })
      sse(res, 'context', fitted.report)

      await sleep(250)
      const finished = await profile.mock({ res, signal: abort.signal, callTool }, lastUser?.content)
      if (finished && !abort.signal.aborted) {
        // 和真实请求一样拼好参数，交给模拟器算一个"差不多"的缓存用量
        const params = buildRequest({
          system: profile.system,
          tools: profile.tools,
          messages: fitted.messages,
        })
        const usage = toUsage(simulateUsage(params, res.locals.mockOutput))
        sse(res, 'done', { stopReason: 'end_turn', usage })
      }
      return res.end()
    }

    const client = script ? createScriptedClient(script) : getClient()
    const result = await runAgentLoop(
      history,
      profile,
      {
        onText: (delta) => sse(res, 'delta', { text: delta }),
        callTool,
        // 每次调用模型之前，把上下文的大小和整理情况推给前端
        onContext: (report) => sse(res, 'context', report),
      },
      abort.signal,
      { client, summarize: script ? mockSummarize : createSummarizer(client) },
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

// ── 人在回路：前端通过这个接口回传"允许 / 拒绝" ──────────────
// POST /chat/approvals/:id  body: { decision: 'allow' | 'deny', note?: string }
chatRouter.post('/approvals/:id', (req, res) => {
  const { decision, note = '' } = req.body ?? {}

  if (decision !== 'allow' && decision !== 'deny') {
    return res.status(400).json({ message: 'decision 只能是 allow 或 deny' })
  }
  if (typeof note !== 'string' || note.length > 500) {
    return res.status(400).json({ message: 'note 必须是 500 字以内的字符串' })
  }

  // ⚠️ id 是随机 UUID，但"猜不出来"不算保护：开这条流的人自己就能收到 id。
  //    真正挡住外人的是 index.js 里的 requireToken（第 30 章"给服务端加一把钥匙"）；
  //    有用户系统的产品还要校验"这个审批属于当前登录用户"。
  const found = resolveApproval(req.params.id, decision, note.trim())
  if (!found) {
    // 不存在、已超时、已处理过、或者那次对话已经断开 —— 对前端来说都是"过期了"
    return res.status(404).json({ message: '审批不存在或已过期' })
  }
  res.json({ ok: true })
})

// GET /chat/approvals → 当前还在等待的审批（调试用，生产环境不要暴露）
chatRouter.get('/approvals', (_req, res) => {
  res.json({ pending: listPendingApprovals() })
})
