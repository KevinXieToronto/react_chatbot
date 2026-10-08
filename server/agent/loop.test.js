// 用脚本化的假模型跑【真实的】runAgentLoop：检查上下文管理接进循环之后，
// 每一次发给"模型"的请求都满足 API 的要求。

import { describe, it, expect, afterEach } from 'vitest'
import { runAgentLoop } from './loop.js'
import { createScriptedClient } from './scriptedClient.js'
import { checkPairing } from './context.js'
import { mockSummarize } from './contextManager.js'

const profile = { system: '测试用的系统提示词', tools: [], parallelTools: false, maxTurns: 20 }

/** 包一层，把每次请求的参数记下来 */
function spyClient(script) {
  const inner = createScriptedClient(script)
  const requests = []
  return {
    requests,
    chat: {
      completions: {
        create(params, options) {
          requests.push(structuredClone(params))
          return inner.chat.completions.create(params, options)
        },
      },
    },
  }
}

describe('runAgentLoop + 上下文管理', () => {
  afterEach(() => {
    delete process.env.CONTEXT_BUDGET_TOKENS
  })

  it('预算很小、工具结果很大：会截断、会删，但每次请求都合法', async () => {
    process.env.CONTEXT_BUDGET_TOKENS = '1500'

    // 连读 8 个文件，然后结束
    let step = 0
    const client = spyClient(() =>
      step++ < 8 ? { toolUses: [{ name: 'read_file', input: { path: `f${step}.js` } }] } : { text: '读完了' },
    )
    const reports = []

    const result = await runAgentLoop(
      [{ role: 'user', content: '把所有文件读一遍' }],
      profile,
      {
        onText: () => {},
        onContext: (r) => reports.push(r),
        // 每个"文件"都有 3000 个字符
        callTool: async () => ({ ok: true, data: 'const x = 1\n'.repeat(250), summary: '读了' }),
      },
      new AbortController().signal,
      { client, summarize: mockSummarize },
    )

    expect(result.stopReason).toBe('stop')
    expect(client.requests).toHaveLength(9)

    for (const params of client.requests) {
      // ① system 在最前面，而且只有一条（它不在 conversation 里，上下文管理碰不到它）
      expect(params.messages[0]).toEqual({ role: 'system', content: profile.system })
      expect(params.messages.filter((m) => m.role === 'system')).toHaveLength(1)
      // ② tool_calls / tool 结果永远成对
      expect(checkPairing(params.messages.slice(1))).toEqual([])
    }

    // 上下文管理确实动手了
    expect(reports.some((r) => r.truncated > 0)).toBe(true)
    expect(reports.some((r) => r.dropped > 0 && r.summarized)).toBe(true)
    // usage 是每一轮累加的；OpenAI 不报缓存写入，这一项一直是 0
    expect(result.usage.input_tokens + result.usage.cache_read_input_tokens).toBeGreaterThan(0)
    expect(result.usage.output_tokens).toBeGreaterThan(0)
    expect(result.usage.cache_creation_input_tokens).toBe(0)
  })

  it('真实的流里工具调用分好几片到达，按 index 拼回完整的调用', async () => {
    const calls = []
    let turn = 0
    // 手写一个"真实形状"的流：id 和 name 在第一片，arguments 分两片
    const client = {
      chat: {
        completions: {
          async create() {
            turn++
            async function* stream() {
              if (turn === 1) {
                const part = (p) => ({ choices: [{ index: 0, delta: { tool_calls: [p] }, finish_reason: null }] })
                yield part({ index: 0, id: 'call_1', type: 'function', function: { name: 'read_file', arguments: '' } })
                yield part({ index: 0, function: { arguments: '{"path":' } })
                yield part({ index: 0, function: { arguments: '"a.js"}' } })
                yield { choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] }
              } else {
                yield { choices: [{ index: 0, delta: { content: '好了' }, finish_reason: 'stop' }] }
              }
              yield { choices: [], usage: { prompt_tokens: 100, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 64 } } }
            }
            return stream()
          },
        },
      },
    }

    const result = await runAgentLoop(
      [{ role: 'user', content: '读 a.js' }],
      profile,
      {
        onText: () => {},
        callTool: async (id, name, input) => {
          calls.push({ id, name, input })
          return { ok: true, data: 'x', summary: '读了' }
        },
      },
      new AbortController().signal,
      { client },
    )

    expect(calls).toEqual([{ id: 'call_1', name: 'read_file', input: { path: 'a.js' } }])
    expect(result.stopReason).toBe('stop')
    // 两轮各 100 输入（其中 64 命中缓存）、5 输出
    expect(result.usage).toEqual({
      input_tokens: 72,
      output_tokens: 10,
      cache_read_input_tokens: 128,
      cache_creation_input_tokens: 0,
    })
  })
})
