import { simulateUsage } from './cacheSimulator.js'
import { sleep } from './stream.js'

/**
 * 【Mock 专用】一个"脚本化的假模型"（第 33 章）。
 *
 * 以前的 Mock 是"剧本直接调工具"，完全绕开了 runAgentLoop。可本章的上下文管理
 * 都写在循环里 —— 绕开循环就什么都看不到了。
 *
 * 所以这里做一个假的 client：长得和 openai SDK 一样
 * （await chat.completions.create(params, { signal }) 返回一个能 for await 的分片流），
 * 但"下一步做什么"由 script(params) 决定。把它交给 runAgentLoop，真实循环的每一行代码
 * （截断、删除、摘要、拼请求、tool_calls / tool 结果配对）都会真的跑一遍。
 *
 * script(params) 返回 { text?, toolUses?: [{ name, input }] }：
 * 有 toolUses 就是"模型要调工具"（finish_reason: tool_calls），否则就是最终回答（stop）。
 * 它没有 responses.inputTokens.count，所以上下文会用估算值，界面上标"估算"。
 */
export function createScriptedClient(script) {
  return {
    chat: {
      completions: {
        async create(params, { signal } = {}) {
          const step = await script(params)
          const text = step.text ?? ''
          const calls = (step.toolUses ?? []).map((t, index) => ({
            index,
            id: `call_mock_${crypto.randomUUID().slice(0, 8)}`,
            type: 'function',
            function: { name: t.name, arguments: JSON.stringify(t.input ?? {}) },
          }))
          const chunk = (delta, finishReason = null) => ({
            choices: [{ index: 0, delta, finish_reason: finishReason }],
          })

          async function* stream() {
            // 像真的模型一样，把文字一小段一小段地"流"出来
            for (let i = 0; i < text.length; i += 3) {
              if (signal?.aborted) throw new DOMException('已中止', 'AbortError')
              yield chunk({ content: text.slice(i, i + 3) })
              await sleep(22)
            }
            if (signal?.aborted) throw new DOMException('已中止', 'AbortError')

            // 真实的流里一个工具调用会分好几片到达，这里一片给全 —— 循环按 index 拼接的逻辑照样适用
            if (calls.length > 0) yield chunk({ tool_calls: calls })
            yield chunk({}, calls.length > 0 ? 'tool_calls' : 'stop')
            // stream_options.include_usage 时，最后一片没有 choices，只有 usage
            yield { choices: [], usage: simulateUsage(params, text + JSON.stringify(calls)) }
          }

          return stream()
        },
      },
    },
  }
}
