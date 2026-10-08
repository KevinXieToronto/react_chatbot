import { describe, it, expect } from 'vitest'
import {
  estimateTokens,
  checkPairing,
  truncateOldToolResults,
  dropOldest,
  withSummary,
  extractSummary,
  buildRequest,
} from './context.js'

// ── 造数据的小工具（OpenAI Chat Completions 的格式） ─────────

const user = (text) => ({ role: 'user', content: text })
const assistant = (text) => ({ role: 'assistant', content: text })
const toolCall = (id) => ({
  id,
  type: 'function',
  function: { name: 'read_file', arguments: JSON.stringify({ path: `${id}.js` }) },
})
const toolResult = (id, result = 'ok') => ({ role: 'tool', tool_call_id: id, content: result })
/** 一对：assistant 调工具 + 一条 tool 消息交回结果 */
const pair = (id, result = 'ok') => [
  { role: 'assistant', content: null, tool_calls: [toolCall(id)] },
  toolResult(id, result),
]
/** 一次并行调用多个工具：一条 assistant + 每个调用一条 tool 消息 */
const batch = (ids, result = 'ok') => [
  { role: 'assistant', content: null, tool_calls: ids.map(toolCall) },
  ...ids.map((id) => toolResult(id, result)),
]
/** 每条消息的"标签"：工具调用看 id，工具结果看 tool_call_id，其余看内容 */
const label = (m) => m.tool_calls?.map((c) => c.id).join('+') ?? m.tool_call_id ?? m.content
/** 按字符数粗算的 cost，测试里够用了 */
const chars = (msgs) => JSON.stringify(msgs).length

describe('estimateTokens', () => {
  it('英文大约 3~4 个字符一个 token，汉字大约一个字一个', () => {
    expect(estimateTokens('a'.repeat(35))).toBe(10)
    expect(estimateTokens('你好世界')).toBe(4)
  })
})

describe('checkPairing', () => {
  it('正常的工具循环没有问题', () => {
    expect(checkPairing([user('读一下'), ...pair('a'), ...batch(['b', 'c']), assistant('读完了')])).toEqual([])
  })

  it('tool_call 后面缺了结果', () => {
    const [call] = pair('a')
    expect(checkPairing([user('读一下'), call])).toHaveLength(1)
  })

  it('并行调用只交回了一部分结果', () => {
    const [call, first] = batch(['a', 'b'])
    expect(checkPairing([user('读一下'), call, first]).join()).toContain('b 后面没有对应的 tool 结果')
  })

  it('tool 结果前面缺了 tool_call（比如 tool_call 被删掉了）', () => {
    const [, result] = pair('a')
    expect(checkPairing([user('读一下'), result]).join()).toContain('前面没有对应的 tool_call')
  })

  it('第一条不能是 tool 结果', () => {
    const [, result] = pair('a')
    expect(checkPairing([result])[0]).toContain('第一条')
  })
})

describe('truncateOldToolResults', () => {
  it('截断旧的大结果，最近一批不动，不修改入参', () => {
    const big = 'x'.repeat(5000)
    const messages = [user('读'), ...pair('a', big), ...pair('b', big)]
    const snapshot = JSON.stringify(messages)

    const { messages: out, truncated } = truncateOldToolResults(messages, { maxChars: 1000 })

    expect(truncated).toBe(1)
    expect(out[2].content.length).toBeLessThan(1200)
    expect(out[2].content).toContain('上下文管理')
    expect(out[4].content).toBe(big) // 最近一批原样保留
    expect(JSON.stringify(messages)).toBe(snapshot) // 入参没被改
    expect(checkPairing(out)).toEqual([])
  })

  it('"最近一批"包括一次并行调用的所有结果', () => {
    const big = 'x'.repeat(5000)
    const messages = [user('读'), ...pair('a', big), ...batch(['b', 'c'], big)]
    const { messages: out, truncated } = truncateOldToolResults(messages, { maxChars: 1000 })
    expect(truncated).toBe(1)
    expect(out[4].content).toBe(big)
    expect(out[5].content).toBe(big)
  })

  it('小结果不动', () => {
    const messages = [user('读'), ...pair('a', 'short'), ...pair('b', 'short')]
    expect(truncateOldToolResults(messages).truncated).toBe(0)
  })
})

describe('dropOldest', () => {
  it('先删历史的来回，当前问题永远保留', () => {
    const messages = [
      user('第一个问题'),
      assistant('回答一'),
      user('第二个问题'),
      assistant('回答二'),
      user('现在的问题'),
    ]
    const { messages: out, dropped } = dropOldest(messages, { limit: 0, cost: chars })
    expect(out).toEqual([user('现在的问题')])
    expect(dropped).toHaveLength(4)
  })

  it('工具循环里按"一对"删，最近两对保留', () => {
    const messages = [user('读所有文件'), ...pair('a'), ...pair('b'), ...pair('c'), ...pair('d')]
    const { messages: out } = dropOldest(messages, { limit: 0, cost: chars })
    expect(out.map(label)).toEqual(['读所有文件', 'c', 'c', 'd', 'd'])
  })

  it('一次并行调用连同它的所有结果一起删', () => {
    const messages = [user('读'), ...batch(['a', 'b']), ...pair('c'), ...pair('d')]
    const { messages: out, dropped } = dropOldest(messages, { limit: 0, cost: chars })
    expect(dropped.map(label)).toEqual(['a+b', 'a', 'b'])
    expect(out.map(label)).toEqual(['读', 'c', 'c', 'd', 'd'])
  })

  it('够了就停，不多删', () => {
    const messages = [user('一'), assistant('答'), user('二'), assistant('答'), user('三')]
    const limit = chars(messages.slice(2))
    expect(dropOldest(messages, { limit, cost: chars }).dropped).toHaveLength(2)
  })

  // ⭐ 本章最重要的一条：不管删到什么程度，tool_calls 和 tool 结果都不会被拆开
  it('随机造 200 段对话，删完之后成对关系永远成立', () => {
    // 每第 3 次造一个"并行调用两个工具"，其余是普通的一对
    const unit = (id, result, k) => (k % 3 === 0 ? batch([`${id}a`, `${id}b`], result) : pair(id, result))

    for (let round = 0; round < 200; round++) {
      const messages = [user('开始')]
      let n = 0
      const exchanges = 1 + (round % 4)
      for (let e = 0; e < exchanges; e++) {
        const pairs = round % 5
        for (let p = 0; p < pairs; p++) messages.push(...unit(`t${n++}`, 'r'.repeat((p + 1) * 50), n))
        messages.push(assistant(`第 ${e} 轮答完`))
        messages.push(user(`第 ${e + 1} 个问题`))
      }
      // 当前问题之后再跑几轮工具
      for (let p = 0; p < round % 6; p++) messages.push(...unit(`t${n++}`, 'z'.repeat(300), n))
      expect(checkPairing(messages)).toEqual([]) // 造的数据本身是合法的

      const limit = Math.floor(chars(messages) * ((round % 10) / 10))
      const { messages: out } = dropOldest(messages, { limit, cost: chars })
      expect(checkPairing(out)).toEqual([])
    }
  })
})

describe('withSummary', () => {
  it('摘要放进第一条用户消息；再摘要一次是替换，不是叠加', () => {
    const once = withSummary([user('现在的问题')], '摘要一')
    expect(extractSummary(once)).toBe('摘要一')
    const twice = withSummary(once, '摘要二')
    expect(extractSummary(twice)).toBe('摘要二')
    expect(twice[0].content).toHaveLength(2) // 摘要 + 原来的问题
    expect(twice[0].content[1].text).toBe('现在的问题')
  })
})

describe('buildRequest', () => {
  const tool = { name: 'read_file', description: '读文件', input_schema: { type: 'object', properties: {} } }

  it('system 放在最前面，工具转成 OpenAI 格式，并且不修改入参', () => {
    const messages = [user('一'), assistant('二'), user('三')]
    const snapshot = JSON.stringify(messages)
    const params = buildRequest({ system: 'SYS', tools: [tool], messages, model: 'm' })

    expect(params.messages).toEqual([{ role: 'system', content: 'SYS' }, ...messages])
    expect(params.tools).toEqual([
      { type: 'function', function: { name: 'read_file', description: '读文件', parameters: tool.input_schema } },
    ])
    expect(params.model).toBe('m')
    expect(params).not.toHaveProperty('system')
    expect(JSON.stringify(messages)).toBe(snapshot)
  })

  it('没有工具时不传 tools（OpenAI 不接受空数组）', () => {
    expect(buildRequest({ system: 'S', tools: [], messages: [user('hi')] })).not.toHaveProperty('tools')
  })

  it('循环里反复调用，system 永远只有一条', () => {
    const conversation = [user('开始')]
    let params
    for (let i = 0; i < 10; i++) {
      params = buildRequest({ system: 'S', tools: [], messages: conversation })
      conversation.push(...pair(`t${i}`))
    }
    expect(params.messages.filter((m) => m.role === 'system')).toHaveLength(1)
    expect(conversation.some((m) => m.role === 'system')).toBe(false)
  })
})
