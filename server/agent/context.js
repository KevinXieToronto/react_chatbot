/**
 * 上下文管理的纯函数（第 33 章）。
 *
 * 这里的函数都不碰网络、不碰磁盘：输入一个 messages 数组，输出一个新的 messages 数组，
 * 【绝不修改】传进来的数组和对象。所以可以放心地单元测试，也可以在每次调用模型前反复调用。
 *
 * 消息是 OpenAI Chat Completions 的格式（教程原文是 Claude 的格式）：
 * - 工具调用：assistant 消息上的 tool_calls 数组；
 * - 工具结果：【每个调用一条】role 为 tool 的消息，靠 tool_call_id 对上号；
 * - system 不在这里面：每次请求时由 buildRequest 放到最前面。
 *
 * 术语：
 * - 一对（pair）：一条带 tool_calls 的 assistant 消息 + 紧跟着的、回应它的那几条 tool 消息。
 *   它们必须同进同出（见 checkPairing）。
 * - 一个来回（exchange）：从一条用户消息开始，到下一条用户消息之前。
 */

// ── 粗略估算 token ─────────────────────────────────────────

/**
 * 粗略估算一段内容有多少 token。⚠️ 只是估算，只在 Mock 模式和"算比例"时用。
 *
 * 经验值：英文和代码大约 3~4 个字符一个 token，汉字大约一个字一个 token。
 * 真实数字取决于模型的分词器，要精确就调 OpenAI 的计数接口（见 contextManager.js）。
 */
export function estimateTokens(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '')
  let ascii = 0
  let other = 0
  for (const ch of text) {
    if (ch.charCodeAt(0) < 128) ascii++
    else other++
  }
  return Math.ceil(ascii / 3.5 + other)
}

// ── 消息结构的小工具 ───────────────────────────────────────

function hasToolCalls(message) {
  return message.role === 'assistant' && (message.tool_calls?.length ?? 0) > 0
}

function isToolResult(message) {
  return message.role === 'tool'
}

/**
 * "用户真正说的话"。OpenAI 的工具结果有自己的 role（tool），
 * 所以 user 消息一定是用户说的 —— 不像 Claude 那样要排除"装着 tool_result 的 user 消息"
 */
function isUserText(message) {
  return message.role === 'user'
}

// ── 规则：tool_calls 和 tool 结果必须成对 ───────────────────

/**
 * 检查 messages 是否满足 API 对工具调用的要求，返回发现的问题（空数组 = 没问题）。
 *
 * API 的规矩（第 25 章）：
 * 1. assistant 消息里的每个 tool_call，后面紧跟的那一串 tool 消息里都要有对应的结果；
 * 2. 每条 tool 消息都必须对应【前面最近那条】assistant 消息里的某个 tool_call，中间只能隔着同一批的 tool 消息；
 * 3. 第一条消息必须是用户说的话（tool 消息打头，前面没有 tool_call 可对应）。
 * 违反任何一条，请求直接 400。上下文管理删消息时最容易踩的就是这个坑。
 */
export function checkPairing(messages) {
  const problems = []
  if (messages.length > 0 && !isUserText(messages[0])) {
    problems.push('第一条消息必须是用户说的话')
  }

  messages.forEach((m, i) => {
    if (hasToolCalls(m)) {
      const answered = new Set()
      for (let j = i + 1; j < messages.length && isToolResult(messages[j]); j++) {
        answered.add(messages[j].tool_call_id)
      }
      for (const call of m.tool_calls) {
        if (!answered.has(call.id)) {
          problems.push(`第 ${i} 条消息的 tool_call ${call.id} 后面没有对应的 tool 结果`)
        }
      }
    }
    if (isToolResult(m)) {
      // 往前跳过同一批的 tool 消息，找到发起调用的那条 assistant
      let j = i - 1
      while (j >= 0 && isToolResult(messages[j])) j--
      const asked = j >= 0 && hasToolCalls(messages[j]) ? messages[j].tool_calls.map((c) => c.id) : []
      if (!asked.includes(m.tool_call_id)) {
        problems.push(`第 ${i} 条 tool 消息 ${m.tool_call_id} 前面没有对应的 tool_call`)
      }
    }
  })
  return problems
}

// ── 策略一：截断旧的工具结果 ───────────────────────────────

/**
 * 把"旧的"大工具结果截成 开头 + 标记 + 结尾。
 *
 * - 只动 tool 消息的内容，不删任何消息 —— 成对关系原封不动；
 * - 最近 keepRecent 批工具结果不动：模型下一步多半就要用它们。
 *   OpenAI 一个调用一条 tool 消息，"一批" = 同一条 assistant 发起的那几个调用的结果；
 * - 标记是写给模型看的：告诉它这里被省略了，需要的话重新调工具去拿。
 *
 * 返回 { messages, truncated }，truncated 是截断了几个结果。
 */
export function truncateOldToolResults(messages, { keepRecent = 1, maxChars = 1000 } = {}) {
  // 从倒数第 keepRecent 条发起调用的 assistant 开始，往后的结果都受保护
  const callIdx = messages.flatMap((m, i) => (hasToolCalls(m) ? [i] : []))
  const protectFrom = callIdx.length > keepRecent ? callIdx[callIdx.length - keepRecent] : 0
  let truncated = 0

  const next = messages.map((m, i) => {
    // 我们的循环里 tool 消息的 content 总是字符串（loop.js 的 toResultContent）
    if (!isToolResult(m) || i >= protectFrom || typeof m.content !== 'string' || m.content.length <= maxChars) {
      return m
    }
    truncated++
    const head = m.content.slice(0, Math.floor(maxChars / 2))
    const tail = m.content.slice(-Math.floor(maxChars / 4))
    const omitted = m.content.length - head.length - tail.length
    return {
      ...m,
      content:
        `${head}\n…[上下文管理：这个工具结果原有 ${m.content.length} 个字符，` +
        `为节省上下文省略了中间 ${omitted} 个。需要完整内容请重新调用工具]…\n${tail}`,
    }
  })

  return { messages: next, truncated }
}

// ── 策略二：丢掉最旧的消息 ─────────────────────────────────

/**
 * 把 messages 切成"只能整体删除"的单元，按从旧到新排列。
 *
 * - 当前这个问题（最后一条用户消息）之前的历史：按"来回"切；
 * - 当前问题之后的工具循环：按"一对"切（assistant 的 tool_calls + 后面那一串 tool 消息）。
 * 当前问题本身不在任何单元里 —— 它永远不会被删。
 */
function splitUnits(messages) {
  let current = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (isUserText(messages[i])) {
      current = i
      break
    }
  }
  if (current === -1) return { current, history: [], pairs: [] }

  const history = []
  for (let i = 0; i < current; ) {
    let j = i + 1
    while (j < current && !isUserText(messages[j])) j++
    history.push([i, j]) // [start, end)
    i = j
  }

  const pairs = []
  for (let i = current + 1; i < messages.length; i++) {
    if (!hasToolCalls(messages[i])) continue
    let j = i + 1
    while (j < messages.length && isToolResult(messages[j])) j++
    if (j > i + 1) pairs.push([i, j])
    i = j - 1
  }
  return { current, history, pairs }
}

/**
 * 从最旧的开始整块删除，直到 cost(剩下的) ≤ limit。
 *
 * - 先删历史的来回，再删当前工具循环里最早的几对；
 * - 最近 keepPairs 对工具调用和当前问题永远保留；
 * - 删的永远是完整单元，所以 tool_calls / tool 结果不会被拆开。
 *
 * @param {(messages: Array) => number} cost 估算一组消息的 token 数
 * @returns {{ messages: Array, dropped: Array }}
 */
export function dropOldest(messages, { limit, cost, keepPairs = 2 }) {
  const { current, history, pairs } = splitUnits(messages)
  if (current === -1) return { messages, dropped: [] }

  const units = [...history, ...pairs.slice(0, Math.max(0, pairs.length - keepPairs))]
  const removed = new Set()
  let kept = messages

  for (const [start, end] of units) {
    if (cost(kept) <= limit) break
    for (let i = start; i < end; i++) removed.add(i)
    kept = messages.filter((_, i) => !removed.has(i))
  }

  return { messages: kept, dropped: messages.filter((_, i) => removed.has(i)) }
}

const SUMMARY_MARK = '【上下文管理：前面有一部分对话为了节省上下文被移除了，下面是它的摘要】\n'

/** 第一条消息里如果已经有一段摘要（之前删过一次），把它取出来；没有就返回空串 */
export function extractSummary(messages) {
  const first = messages[0]
  const part = Array.isArray(first?.content) ? first.content[0] : null
  return part?.type === 'text' && part.text.startsWith(SUMMARY_MARK) ? part.text.slice(SUMMARY_MARK.length) : ''
}

/**
 * 把摘要塞进第一条用户消息的开头；已经有摘要的话【替换】它，而不是越叠越多。
 *
 * user 消息的 content 除了字符串，也可以是 [{ type: 'text', text }] 这样的数组，
 * 摘要就作为第一段放进去。为什么不单独插一条？第一条最好是用户说的话；
 * 直接放进同一条消息里最简单，也不会动到任何 tool_calls / tool 结果。
 */
export function withSummary(messages, summary) {
  if (!summary || messages.length === 0) return messages
  const note = { type: 'text', text: SUMMARY_MARK + summary }
  const [first, ...rest] = messages
  const parts = typeof first.content === 'string' ? [{ type: 'text', text: first.content }] : first.content
  const body = extractSummary(messages) ? parts.slice(1) : parts
  return [{ ...first, content: [note, ...body] }, ...rest]
}

/** 把一段消息渲染成纯文本，交给摘要模型（或者 Mock 的摘要）用 */
export function renderTranscript(messages, { maxResultChars = 400 } = {}) {
  const lines = []
  for (const m of messages) {
    if (isToolResult(m)) {
      lines.push(`工具结果：${String(m.content).slice(0, maxResultChars)}`)
      continue
    }
    const who = m.role === 'user' ? '用户' : '助手'
    const text =
      typeof m.content === 'string'
        ? m.content
        : (m.content ?? []).map((p) => p.text ?? '').join('\n')
    if (text) lines.push(`${who}：${text}`)
    for (const call of m.tool_calls ?? []) {
      lines.push(`助手调用 ${call.function.name}(${call.function.arguments})`)
    }
  }
  return lines.join('\n')
}

// ── 拼请求（提示缓存要的是稳定的前缀） ─────────────────────

/**
 * 拼出发给 chat.completions.create 的参数，返回新对象（不修改入参）。
 *
 * OpenAI 的提示缓存是【自动】的，没有 Claude 那种 cache_control 断点，
 * 所以教程里的 addCacheBreakpoints 在这里没有对应物：
 * - 整个请求至少 1024 token 才会缓存；之后 API 自动找"和最近某次请求完全相同的最长前缀"，按 128 token 一档命中；
 * - 命中的部分记在 usage.prompt_tokens_details.cached_tokens 里，按折扣价计费；写缓存不额外收费。
 *
 * 我们能做的只有一件事：让前缀尽量稳定。
 * - tools 和 system 每次都一样，排在最前面；system 每次请求时才拼上，不存进 conversation，
 *   上下文管理永远碰不到它，也不会出现两条 system；
 * - conversation 只往后追加，没超预算就一个字都不改（见 contextManager.js 的 fitContext）。
 */
export function buildRequest({ system, tools = [], messages, ...rest }) {
  return {
    ...rest,
    // 教程（Claude）格式 { name, description, input_schema } → OpenAI 格式。JSON Schema 本身一样。
    // 没有工具时干脆不传：OpenAI 不接受空的 tools 数组
    ...(tools.length > 0 && {
      tools: tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.input_schema },
      })),
    }),
    messages: [{ role: 'system', content: system }, ...messages],
  }
}
