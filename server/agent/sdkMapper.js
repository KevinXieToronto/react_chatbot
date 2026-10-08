/**
 * OpenAI Agents SDK 的流式事件 → 我们自己的 SSE 事件（第 34 章）。
 *
 * 这是整个"换引擎"的关键：前端从第 22 章起只认识
 *   delta / tool_start / tool_end / tool_output / invalidate / done / error
 * （审批的两个事件由 approvals.js 直接发，命令的实时输出由工具自己发，都不经过这里）。
 * 只要把 SDK 的事件翻译成这几种，前端一行都不用为 SDK 改。
 *
 * run(agent, input, { stream: true }) 产出的事件（RunStreamEvent）有三种：
 * - raw_model_stream_event：模型的原始流，我们只要其中的 output_text_delta（文字增量）
 * - run_item_stream_event：一个"运行条目"产生了 —— tool_called、tool_output、tool_approval_requested、message_output_created……
 * - agent_updated_stream_event：换了一个 Agent（handoff），我们只有一个 Agent，用不到
 *
 * 纯逻辑、不碰网络：输入一个 SDK 事件，输出 0 到多条 { event, data }。方便用造出来的事件做单元测试。
 */

/** 我们的 MCP 服务器暴露的工具，打开 includeServerInToolNames 后名字都带这个前缀 */
export const TASKFLOW_PREFIX = 'mcp_taskflow__'
const TASK_WRITERS = new Set(['create_task', 'update_task', 'delete_task'])

/** 工具输出可能是字符串，也可能是 { type: 'text' | 'input_text', text } 或它们的数组（MCP 工具） */
function outputText(output) {
  if (typeof output === 'string') return output
  if (Array.isArray(output)) return output.map(outputText).join('\n')
  if (typeof output?.text === 'string') return output.text
  return output == null ? '' : JSON.stringify(output)
}

function parseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** 取第一行，截到 80 字 */
function firstLine(text) {
  const line = text.trim().split('\n')[0] ?? ''
  return line.length > 80 ? `${line.slice(0, 80)}…` : line
}

/**
 * MCP 任务工具的结果 → 一句话总结 + 要不要刷新任务。
 * 我们的 MCP 服务器成功时交回数据的 JSON，失败时交回 {"error": "..."}（见 taskflowMcp.js）
 */
function taskOutcome(op, text) {
  const data = parseJson(text)
  if (data?.error) return { ok: false, summary: `失败：${data.error}` }
  const invalidate = TASK_WRITERS.has(op) ? { resource: 'tasks', op } : undefined
  switch (op) {
    case 'list_tasks':
      return { ok: true, summary: Array.isArray(data) ? `找到 ${data.length} 条任务` : firstLine(text) }
    case 'create_task':
      return { ok: true, summary: `已创建「${data?.title ?? ''}」`, invalidate }
    case 'update_task':
      return { ok: true, summary: `已更新「${data?.title ?? ''}」`, invalidate }
    case 'delete_task':
      return { ok: true, summary: '已删除任务', invalidate }
    default:
      return { ok: true, summary: firstLine(text) || '完成' }
  }
}

/** SDK 的 Usage → 前端认的四种 token（和 openai.js 的 toUsage 是同一个意思） */
export function toWireUsage(usage) {
  // inputTokensDetails 是"每次请求一条"的数组，cached_tokens 要加起来
  const cached = (usage?.inputTokensDetails ?? []).reduce((sum, d) => sum + (d?.cached_tokens ?? 0), 0)
  return {
    input_tokens: (usage?.inputTokens ?? 0) - cached,
    output_tokens: usage?.outputTokens ?? 0,
    cache_read_input_tokens: cached,
    cache_creation_input_tokens: 0,
  }
}

export function createSdkEventMapper() {
  /** callId → 工具名，等结果回来时要知道它是哪个工具 */
  const tools = new Map()
  /** 已经发过 tool_start 的 callId，避免重复 */
  const started = new Set()
  /** 执行工具的一方（我们的代码工具、审批）登记的结果：{ ok, summary, invalidate? } */
  const outcomes = new Map()

  // 两次调用模型输出的文字拼在同一个气泡里，中间补个空行（和手写循环一样，第 26 章）
  let hasText = false
  let responseHasText = false

  function startTool(id, name, input) {
    if (started.has(id)) return []
    started.add(id)
    tools.set(id, name)
    return [{ event: 'tool_start', data: { id, name, input } }]
  }

  function text(delta) {
    const out = []
    if (!responseHasText && hasText) out.push({ event: 'delta', data: { text: '\n\n' } })
    hasText = true
    responseHasText = true
    out.push({ event: 'delta', data: { text: delta } })
    return out
  }

  function map(event) {
    if (event.type === 'raw_model_stream_event') {
      const data = event.data
      if (data.type === 'response_started') responseHasText = false
      if (data.type === 'output_text_delta' && data.delta) return text(data.delta)
      return []
    }
    if (event.type !== 'run_item_stream_event') return []

    const raw = event.item.rawItem
    switch (event.name) {
      // 模型要调工具。需要审批的工具先来 tool_approval_requested，批准后才是 tool_called —— 两个都可能是"第一次见到"
      case 'tool_called':
      case 'tool_approval_requested': {
        if (raw?.type !== 'function_call') return []
        return startTool(raw.callId, raw.name, parseJson(raw.arguments || '{}') ?? {})
      }

      case 'tool_output': {
        const id = raw.callId
        const name = raw.name ?? tools.get(id) ?? ''
        const result = outputText(event.item.output ?? raw.output)
        const outcome =
          outcomes.get(id) ??
          (name.startsWith(TASKFLOW_PREFIX)
            ? taskOutcome(name.slice(TASKFLOW_PREFIX.length), result)
            : { ok: true, summary: firstLine(result) || '完成' })

        const out = [{ event: 'tool_end', data: { id, ok: outcome.ok, summary: outcome.summary } }]
        // 和第 26、29 章一样：改了数据就通知前端刷新
        if (outcome.ok && outcome.invalidate) out.push({ event: 'invalidate', data: outcome.invalidate })
        return out
      }

      // 完整的一条回答。开着流式的话这些字已经通过 output_text_delta 发过了，
      // 只有这次调用模型一个增量都没收到时（比如模型不支持流式）才整段发出去，不然字会重复
      case 'message_output_created': {
        if (responseHasText) return []
        const whole = (raw?.content ?? [])
          .filter((c) => c.type === 'output_text')
          .map((c) => c.text)
          .join('')
        return whole ? text(whole) : []
      }

      default:
        return []
    }
  }

  return {
    map,
    startTool,
    /** 登记某个工具调用的结果（一句话总结、是否成功、要刷新什么），tool_end 时用它 */
    setOutcome: (id, outcome) => outcomes.set(id, outcome),
  }
}
