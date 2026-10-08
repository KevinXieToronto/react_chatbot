import { MODEL } from './openai.js'
import {
  estimateTokens,
  truncateOldToolResults,
  dropOldest,
  withSummary,
  extractSummary,
  renderTranscript,
} from './context.js'

/**
 * 上下文预算：每次调用模型前，整个请求（tools + system + messages）最多多少 token。
 *
 * 现在的模型上下文窗口动辄几十万甚至上百万 token，但"能放下"不等于"该放这么多"：
 * 工具循环每一轮都要把整段对话重新发一遍，20 轮 × 10 万 token 就是 200 万输入 token。
 * 所以预算远小于窗口，默认 10 万。用环境变量 CONTEXT_BUDGET_TOKENS 可以调小，方便观察。
 *
 * 写成函数：和 workspaceRoot() 一样，等 dotenv 加载完再读环境变量（第 29 章）。
 */
export function contextBudget() {
  const n = Number(process.env.CONTEXT_BUDGET_TOKENS)
  return Number.isFinite(n) && n > 0 ? n : 100_000
}

/**
 * Chat Completions 的 messages → Responses API 的 input（只给 measureTokens 用）。
 * 两边的区别主要在工具调用：tool_calls 拆成一个个 function_call，tool 消息变成 function_call_output。
 */
function toResponsesInput(messages) {
  return messages.flatMap((m) => {
    if (m.role === 'tool') {
      return [{ type: 'function_call_output', call_id: m.tool_call_id, output: m.content }]
    }
    const items = []
    const text = typeof m.content === 'string' ? m.content : (m.content ?? []).map((p) => p.text).join('\n')
    if (text) items.push({ role: m.role, content: text })
    for (const c of m.tool_calls ?? []) {
      items.push({ type: 'function_call', call_id: c.id, name: c.function.name, arguments: c.function.arguments })
    }
    return items
  })
}

/**
 * 数一数这次请求有多少输入 token。
 *
 * - 真实模式：Chat Completions 没有"只数 token、不生成"的接口，Responses API 有：
 *   client.responses.inputTokens.count，按模型真正的分词器算。参数是 Responses 的格式，
 *   所以先转一下。两个接口拼装消息的方式略有不同，和实际的 prompt_tokens 可能差几个 token。
 * - Mock 模式（脚本化的假模型没有 responses.inputTokens）：用 estimateTokens 粗估，界面上会标"估算"。
 * - 计数请求失败时也退回估算：数不准不应该让整个对话失败。
 */
export async function measureTokens(client, { system, tools, messages }) {
  if (typeof client?.responses?.inputTokens?.count === 'function') {
    try {
      const r = await client.responses.inputTokens.count({
        model: MODEL,
        instructions: system,
        // Responses 的函数工具是扁平的；strict 关掉，和 chat.completions 里的定义保持一致
        tools: tools.map((t) => ({
          type: 'function',
          name: t.name,
          description: t.description,
          parameters: t.input_schema,
          strict: false,
        })),
        input: toResponsesInput(messages),
      })
      return { tokens: r.input_tokens, exact: true }
    } catch (err) {
      console.warn('[context] 计数接口失败，改用估算：', err?.message)
    }
  }
  return { tokens: estimateTokens([tools, system, messages]), exact: false }
}

/**
 * 让 conversation 装进预算。调用模型之前执行，返回 { messages, report }。
 *
 * 顺序由便宜到贵：
 *   0. 没超预算：原样返回（不动历史 = 不破坏提示缓存的前缀）
 *   1. 截断旧的大工具结果（只改内容，不删消息）
 *   2. 还超：从最旧的开始整块删除，一直删到预算的 70%（留出余量，免得下一轮又要删）；
 *      删掉的部分交给 summarize 生成摘要，塞回第一条用户消息
 *
 * report 会通过 SSE 的 context 事件发给前端，显示在上下文条上。
 */
export async function fitContext(conversation, profile, { client, summarize, budget = contextBudget() }) {
  const base = { system: profile.system, tools: profile.tools }
  let messages = conversation
  let m = await measureTokens(client, { ...base, messages })

  const report = {
    tokens: m.tokens,
    before: m.tokens,
    budget,
    exact: m.exact,
    truncated: 0,
    dropped: 0,
    summarized: false,
  }
  if (m.tokens <= budget) return { messages, report }

  // ① 截断旧工具结果
  const t = truncateOldToolResults(messages)
  messages = t.messages
  report.truncated = t.truncated
  if (t.truncated > 0) m = await measureTokens(client, { ...base, messages })

  // ② 删最旧的
  if (m.tokens > budget) {
    // 精确计数一次要一个网络请求，不能每删一条都数一遍。
    // 做法：用估算算"相对大小"，再按"精确值 / 估算值"的比例换算回来
    const fixed = estimateTokens([base.tools, base.system])
    const ratio = m.tokens / (fixed + estimateTokens(messages))
    const cost = (msgs) => ratio * (fixed + estimateTokens(msgs))

    const d = dropOldest(messages, { limit: budget * 0.7, cost })
    if (d.dropped.length > 0) {
      report.dropped = d.dropped.length
      messages = d.messages
      if (summarize) {
        // 之前删过一次的话，第一条消息里已经有一段摘要了：新摘要要把它也概括进去
        const summary = await summarize(d.dropped, extractSummary(d.messages))
        messages = withSummary(messages, summary)
        report.summarized = Boolean(summary)
      }
      m = await measureTokens(client, { ...base, messages })
    }
  }

  report.tokens = m.tokens
  return { messages, report }
}

/**
 * 真实模式的摘要：再调一次模型，把删掉的那段对话压缩成几句话。
 *
 * 摘要是个简单任务，换成更便宜的小模型通常就够了（练习 3）。
 * 这里保持和主循环同一个模型，省得多一个变量。
 *
 * previous：之前删过一次时留下的摘要。新摘要要把它也概括进去，而不是丢掉。
 */
export function createSummarizer(client) {
  return async function summarize(dropped, previous = '') {
    const earlier = previous ? `更早的摘要：\n${previous}\n\n` : ''
    try {
      const res = await client.chat.completions.create({
        model: MODEL,
        max_completion_tokens: 1024,
        // 和主循环一样关掉推理：推理 token 也算在 max_completion_tokens 里，
        // 开着的话可能还没写到正文，1024 个 token 就用完了
        reasoning_effort: 'none',
        messages: [
          {
            role: 'system',
            content:
              '你负责压缩对话历史。用中文写一份不超过 300 字的摘要，只保留后续工作需要的信息：' +
              '用户的目标、已经确认的事实（读过的文件要点、命令和测试的结果）、已经做过的修改、还没完成的事。' +
              '不要编造，不要写客套话。',
          },
          { role: 'user', content: earlier + renderTranscript(dropped) },
        ],
      })
      return res.choices[0]?.message?.content?.trim() || previous
    } catch (err) {
      // 摘要失败就不要新摘要了：少一段背景，总比整个请求失败好
      console.warn('[context] 生成摘要失败：', err?.message)
      return previous
    }
  }
}

/**
 * Mock 模式的摘要：不调模型，把删掉的内容列个清单。
 * 最多留 8 行：摘要本身也占上下文，不能越滚越大。
 */
export async function mockSummarize(dropped, previous = '') {
  const head = '（Mock 摘要，真实模式会由模型来写）被移除的内容：'
  const earlier = previous ? previous.split('\n').slice(1) : []
  const lines = renderTranscript(dropped, { maxResultChars: 40 })
    .split('\n')
    .map((line) => line.slice(0, 60))
  return [head, ...[...earlier, ...lines].slice(-8)].join('\n')
}
