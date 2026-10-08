import { getClient, MODEL, toUsage } from './openai.js'
import { buildRequest } from './context.js'
import { fitContext } from './contextManager.js'

/** 把一轮的 usage 累加进总数。缓存读和普通输入分开记，因为它们的价格不一样 */
function addUsage(total, usage) {
  total.input_tokens += usage.input_tokens
  total.output_tokens += usage.output_tokens
  total.cache_read_input_tokens += usage.cache_read_input_tokens
  total.cache_creation_input_tokens += usage.cache_creation_input_tokens
}

/**
 * 跑完整的 tool use 循环。
 *
 * 和第 25 章相比，系统提示词、工具列表、是否并行都从 profile 里取，
 * 执行工具统一交给 callTool（它负责发 tool_start / tool_end / invalidate 事件）。
 * 这样同一个循环既能跑任务助手，也能跑代码助手。
 *
 * 第 33 章加了两件事，都在"调用模型之前"：
 *   ① fitContext：超预算时截断旧工具结果、删掉最旧的消息并生成摘要，然后发 context 事件
 *   ② buildRequest：在一份副本上拼出请求（system 放最前面），conversation 本身不放 system
 * 另外 usage 从两种 token 扩展成四种，分别累加（缓存读的价格不一样）。
 *
 * @param {Array} messages 对话历史（只有 role/content）
 * @param {object} profile { system, tools, parallelTools, maxTurns }
 * @param {object} handlers { onText, callTool, onContext }
 * @param {AbortSignal} signal
 * @param {{ client?, summarize? }} options client 默认是真实的 OpenAI 客户端；Mock 时传脚本化的假客户端
 */
export async function runAgentLoop(messages, profile, handlers, signal, options = {}) {
  const client = options.client ?? getClient()

  // 这个数组会随着循环不断增长：assistant 的 tool_calls、role 为 tool 的工具结果。
  // ⚠️ 第 33 章起 system 不放进来：每次请求时由 buildRequest 拼到最前面，上下文管理碰不到它
  let conversation = messages.map((m) => ({ role: m.role, content: m.content }))

  // 用量要【累加】：每一轮都是一次独立的 API 调用、各自计费（第 26 章）
  const usage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  }

  // 之前的轮次有没有输出过文字（用来在两轮文字之间补空行）
  let hasText = false

  for (let turn = 0; turn < profile.maxTurns; turn++) {
    if (signal?.aborted) return { stopReason: 'aborted', usage }

    // ① 上下文管理。整理后的结果直接替换 conversation：
    //    删掉的消息不会再回来，下一轮就不用再删一遍、再摘要一遍；
    //    前缀也因此稳定下来，提示缓存才能继续命中
    const fitted = await fitContext(conversation, profile, {
      client,
      summarize: options.summarize,
    })
    conversation = fitted.messages
    handlers.onContext?.(fitted.report)

    // ② 拼请求：在一份【副本】上加 system、转换工具格式，不污染 conversation
    const params = buildRequest({
      model: MODEL,
      max_completion_tokens: 16000,
      stream: true,
      stream_options: { include_usage: true },
      // ⚠️ gpt-5.6-luna 在 /v1/chat/completions 里不能同时用推理和函数工具，
      //    不关掉推理会直接 400（要保留推理，得改用 /v1/responses 接口）
      reasoning_effort: 'none',
      system: profile.system,
      tools: profile.tools,
      messages: conversation,
    })

    // 用户中止时同时取消对模型的请求：直接把 signal 交给 SDK
    const stream = await client.chat.completions.create(params, { signal })

    let text = ''
    let finishReason = null
    let refused = false
    // 流式的工具调用是分片到达的：第一片带 id 和 name，后面的片只带 arguments 的一小段。
    // 按 index 把它们拼回完整的调用
    const calls = []

    // 文本增量实时推给前端。两轮的文字拼在同一个气泡里，中间补个空行（第 26 章）
    let turnHasText = false

    for await (const chunk of stream) {
      if (chunk.usage) addUsage(usage, toUsage(chunk.usage))
      const choice = chunk.choices[0]
      if (!choice) continue

      const delta = choice.delta ?? {}
      if (delta.content) {
        if (!turnHasText && hasText) handlers.onText('\n\n')
        turnHasText = true
        hasText = true
        text += delta.content
        handlers.onText(delta.content)
      }
      if (delta.refusal) refused = true

      for (const part of delta.tool_calls ?? []) {
        const call = (calls[part.index] ??= { id: '', name: '', arguments: '' })
        if (part.id) call.id = part.id
        if (part.function?.name) call.name += part.function.name
        if (part.function?.arguments) call.arguments += part.function.arguments
      }

      if (choice.finish_reason) finishReason = choice.finish_reason
    }

    // ⚠️ 模型拒绝回答 —— HTTP 200 但不能用 content
    if (refused || finishReason === 'content_filter') {
      return { stopReason: 'refusal', usage }
    }

    const toolCalls = calls.filter(Boolean)

    // ⚠️ 被 max_completion_tokens 截断（finish_reason 为 length）时，工具参数可能是残缺的 JSON。
    //    绝不能执行它 —— 参数残缺意味着行为不可预期。
    if (finishReason === 'length' && toolCalls.length > 0) {
      return { stopReason: 'truncated', usage }
    }

    // 没有工具调用 = 模型给出最终答案了，循环结束
    if (finishReason !== 'tool_calls' || toolCalls.length === 0) {
      return { stopReason: finishReason, usage }
    }

    // 把模型这一轮的输出（含 tool_calls）追加进对话
    conversation.push({
      role: 'assistant',
      content: text || null,
      tool_calls: toolCalls.map((c) => ({
        id: c.id,
        type: 'function',
        function: { name: c.name, arguments: c.arguments },
      })),
    })

    const runOne = async (call) => {
      // arguments 是模型生成的 JSON 字符串，可能不合法。
      // 不合法就不执行（参数都读不懂，行为不可预期），把原因告诉模型让它重来
      let input
      try {
        input = call.arguments ? JSON.parse(call.arguments) : {}
      } catch {
        return {
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify({ error: '参数不是合法的 JSON，请重新调用' }),
        }
      }

      const result = await handlers.callTool(call.id, call.name, input)
      // 失败的工具也必须返回结果。
      // 漏掉任何一个 tool_call_id 的结果，下一次请求会直接 400。
      return { role: 'tool', tool_call_id: call.id, content: toResultContent(result) }
    }

    let results
    if (profile.parallelTools) {
      // 任务工具互不影响，并行跑更快
      results = await Promise.all(toolCalls.map(runOne))
    } else {
      // 编码工具一个一个来：后一个可能依赖前一个的结果（先建文件再改它）
      results = []
      for (const call of toolCalls) {
        if (signal?.aborted) return { stopReason: 'aborted', usage }
        results.push(await runOne(call))
      }
    }

    // OpenAI 的工具结果是【每个调用一条】role 为 tool 的消息，
    // 和 Claude 把所有 tool_result 放进同一条 user 消息不一样
    conversation.push(...results)
  }

  return { stopReason: 'max_turns', usage }
}

/**
 * 工具结果的 content 直接给字符串。
 * read_file 这种本来就是文本的结果原样给，别再 JSON.stringify 一遍 ——
 * 否则换行全变成 \n 转义，模型读代码会很别扭。
 * OpenAI 的 tool 消息没有 is_error 字段，失败就用 { error } 告诉模型。
 * 第 34 章的 SDK 引擎也用它：两个引擎交给模型的工具结果格式一样。
 */
export function toResultContent(result) {
  if (!result.ok) return JSON.stringify({ error: result.error })
  return typeof result.data === 'string' ? result.data : JSON.stringify(result.data)
}
