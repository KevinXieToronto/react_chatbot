// @ts-check
/**
 * 按 OpenAI Agents SDK 的类型"造"事件（第 34 章）。
 *
 * 两个地方要用：
 * - Mock 模式的假模型（mockSdk.js）：没有 key 调不了真的模型，就由它按剧本产出模型的流式事件；
 * - 映射函数的单元测试（sdkMapper.test.js）：用 SDK 自己导出的类造 run_item_stream_event。
 *
 * 文件第一行的 `// @ts-check` 让 VS Code 按 JSDoc 里写的类型检查这个 .js 文件：
 * 字段写错、漏了必填字段，编辑器里当场就是红线。这样造出来的事件和真实 SDK 发的一定对得上。
 *
 * @typedef {import('@openai/agents').StreamEvent} StreamEvent
 * @typedef {import('@openai/agents').AgentOutputItem} AgentOutputItem
 * @typedef {import('@openai/agents').protocol.FunctionCallItem} FunctionCallItem
 */
import {
  Agent,
  RunItemStreamEvent,
  RunMessageOutputItem,
  RunRawModelStreamEvent,
  RunToolApprovalItem,
  RunToolCallItem,
  RunToolCallOutputItem,
} from '@openai/agents'

// ── 模型这一层：Model.getStreamedResponse 产出的事件 ─────────────

/** @returns {StreamEvent} */
export function responseStarted() {
  return { type: 'response_started' }
}

/**
 * @param {string} delta
 * @returns {StreamEvent}
 */
export function textDelta(delta) {
  return { type: 'output_text_delta', delta }
}

/**
 * 一条完整的回答（放进 response_done 的 output 里）
 * @param {string} id
 * @param {string} text
 * @returns {AgentOutputItem}
 */
export function assistantMessage(id, text) {
  return { type: 'message', id, role: 'assistant', status: 'completed', content: [{ type: 'output_text', text }] }
}

/**
 * 模型要调一个工具
 * @param {string} callId
 * @param {string} name
 * @param {Record<string, unknown>} input
 * @returns {FunctionCallItem}
 */
export function functionCall(callId, name, input) {
  return { type: 'function_call', callId, name, arguments: JSON.stringify(input), status: 'completed' }
}

/**
 * 这次调用模型结束。Mock 没有调真的模型，用量如实填 0
 * @param {string} id
 * @param {AgentOutputItem[]} output
 * @returns {StreamEvent}
 */
export function responseDone(id, output) {
  return {
    type: 'response_done',
    response: { id, usage: { requests: 1, inputTokens: 0, outputTokens: 0, totalTokens: 0 }, output },
  }
}

// ── Runner 这一层：run(..., { stream: true }) 产出的事件（测试用） ────

/** 造事件要指明是哪个 Agent 产生的，测试里随便给一个 */
const AGENT = new Agent({ name: 'test' })

/**
 * @param {string} delta
 * @returns {RunRawModelStreamEvent}
 */
export function rawTextDelta(delta) {
  return new RunRawModelStreamEvent(textDelta(delta))
}

/** @returns {RunRawModelStreamEvent} */
export function rawResponseStarted() {
  return new RunRawModelStreamEvent(responseStarted())
}

/**
 * @param {string} callId
 * @param {string} name
 * @param {Record<string, unknown>} input
 */
export function toolCalled(callId, name, input) {
  return new RunItemStreamEvent('tool_called', new RunToolCallItem(functionCall(callId, name, input), AGENT))
}

/**
 * @param {string} callId
 * @param {string} name
 * @param {Record<string, unknown>} input
 */
export function approvalRequested(callId, name, input) {
  return new RunItemStreamEvent(
    'tool_approval_requested',
    new RunToolApprovalItem(functionCall(callId, name, input), AGENT),
  )
}

/**
 * 工具的结果
 * @param {string} callId
 * @param {string} name
 * @param {string} output
 */
export function toolOutput(callId, name, output) {
  return new RunItemStreamEvent(
    'tool_output',
    new RunToolCallOutputItem(
      { type: 'function_call_result', callId, name, status: 'completed', output: { type: 'text', text: output } },
      AGENT,
      output,
    ),
  )
}

/**
 * 一条完整的回答
 * @param {string} id
 * @param {string} text
 */
export function messageOutput(id, text) {
  const raw = { type: /** @type {const} */ ('message'), id, role: /** @type {const} */ ('assistant'), status: /** @type {const} */ ('completed'), content: [{ type: /** @type {const} */ ('output_text'), text }] }
  return new RunItemStreamEvent('message_output_created', new RunMessageOutputItem(raw, AGENT))
}
