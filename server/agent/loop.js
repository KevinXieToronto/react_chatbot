import { getClient, MODEL, SYSTEM_PROMPT } from './openai.js'
import { openaiTools, runTool } from './tools.js'

/** 安全上限：防止模型陷入无限工具调用循环 */
const MAX_TURNS = 8

/**
 * 跑完整的 tool use 循环，通过回调把每一步汇报出去。
 *
 * @param {Array} messages 对话历史（只有 role/content）
 * @param {object} handlers { onText, onToolStart, onToolEnd }
 * @param {AbortSignal} signal
 */
export async function runAgentLoop(messages, handlers, signal) {
  const client = getClient()

  // 这个数组会随着循环不断增长：assistant 的 tool_calls、role 为 tool 的工具结果。
  // OpenAI 的系统提示词是第一条 system 消息
  const conversation = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ]

  // 用量要【累加】：每一轮都是一次独立的 API 调用、各自计费，
  // 而且后一轮的输入包含前面所有轮次。只报最后一轮的话，多步任务会少算好几倍
  const usage = { input_tokens: 0, output_tokens: 0 }

  // 之前的轮次有没有输出过文字（用来在两轮文字之间补空行）
  let hasText = false

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    if (signal?.aborted) return { stopReason: 'aborted', usage }

    // 用户中止时同时取消对模型的请求：直接把 signal 交给 SDK
    const stream = await client.chat.completions.create(
      {
        model: MODEL,
        max_completion_tokens: 16000,
        stream: true,
        stream_options: { include_usage: true },
        // ⚠️ gpt-5.6-luna 在 /v1/chat/completions 里不能同时用推理和函数工具，
        //    不关掉推理会直接 400（要保留推理，得改用 /v1/responses 接口）
        reasoning_effort: 'none',
        tools: openaiTools,
        messages: conversation,
      },
      { signal },
    )

    let text = ''
    let finishReason = null
    let refused = false
    // 流式的工具调用是分片到达的：第一片带 id 和 name，后面的片只带 arguments 的一小段。
    // 按 index 把它们拼回完整的调用
    const calls = []

    // 文本增量实时推给前端。
    // 模型常常先说一句"我查一下"，调完工具在下一轮再接着说 —— 两轮的文字在前端
    // 是拼在同一个气泡里的，中间不补个空行就会粘成一句话
    let turnHasText = false

    for await (const chunk of stream) {
      if (chunk.usage) {
        usage.input_tokens += chunk.usage.prompt_tokens ?? 0
        usage.output_tokens += chunk.usage.completion_tokens ?? 0
      }
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

    // 并行执行所有工具调用。
    // 模型一轮可能要求调多个工具，串行跑会慢很多。
    const results = await Promise.all(
      toolCalls.map(async (call) => {
        // arguments 是模型生成的 JSON 字符串，可能不合法 —— 解析失败也要回一个结果给模型
        let input
        let result
        try {
          input = call.arguments ? JSON.parse(call.arguments) : {}
        } catch {
          input = {}
          result = { ok: false, error: '参数不是合法的 JSON', summary: '失败：参数不是合法的 JSON' }
        }

        handlers.onToolStart({ id: call.id, name: call.name, input })

        result ??= await runTool(call.name, input)

        // 多传 name 和 task：路由要靠它们决定发不发 invalidate 事件（第 26 章）
        handlers.onToolEnd({
          id: call.id,
          name: call.name,
          ok: result.ok,
          summary: result.summary,
          task: result.task,
        })

        // 失败的工具也必须返回结果。
        // 漏掉任何一个 tool_call_id 的结果，下一次请求会直接 400。
        return {
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(result.ok ? result.data : { error: result.error }),
        }
      }),
    )

    // OpenAI 的工具结果是【每个调用一条】role 为 tool 的消息，
    // 和 Claude 把所有 tool_result 放进同一条 user 消息不一样
    conversation.push(...results)
  }

  return { stopReason: 'max_turns', usage }
}
