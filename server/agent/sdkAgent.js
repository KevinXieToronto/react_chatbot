import {
  Agent,
  MaxTurnsExceededError,
  assistant,
  run,
  setDefaultOpenAIClient,
  setTracingDisabled,
  tool,
  user,
} from '@openai/agents'
import { getClient, MODEL } from './openai.js'
import { getProfile, CODE_SYSTEM_PROMPT } from './profiles.js'
import { needsApproval, approvalReason } from './permissions.js'
import { requestApproval } from './approvals.js'
import { deniedResult } from './toolRunner.js'
import { toResultContent } from './loop.js'
import { createSdkEventMapper, toWireUsage, TASKFLOW_PREFIX } from './sdkMapper.js'
import { createTaskflowMcpServer, InProcessMcpServer } from './taskflowMcp.js'

/**
 * 用 OpenAI Agents SDK 跑一轮对话（第 34 章，教程原文用的是 Claude Agent SDK）。
 *
 * 和第 25~33 章的 runAgentLoop 做的是同一件事 —— 调模型、执行工具、把结果喂回去、直到模型说完 ——
 * 只不过循环在 SDK 的 Runner 里。我们要做的只有三件：
 *   1. 配置：Agent 的提示词、工具（第 29 章的代码工具 + MCP 交过来的任务工具）、模型
 *   2. 权限：needsApproval 让 Runner 在要问人的工具前"中断"，我们接上第 30 章的审批 Map，再继续跑
 *   3. 翻译：SDK 的事件 → 我们的 SSE 事件（sdkMapper.js）
 *
 * 和 Claude Agent SDK 最大的不同：OpenAI Agents SDK 是一个"Agent 框架"，不是打包好的编码 Agent，
 * 没有 Read / Write / Bash 这种内置的本地工具。所以工具还是我们自己的 —— 沙箱、diff、
 * 过期预览保护、命令实时输出全都保留，"看到的 = 写入的"也照样成立。
 */

// ⚠️ Agents SDK 默认会把每次运行的 trace（提示词、工具参数和结果）上传到 OpenAI 后台的 Traces 页面。
//    服务端替网页用户跑的 Agent，数据去哪儿要自己决定，这里先关掉；想在后台看运行过程再打开。
setTracingDisabled(true)

const MAX_TURNS = 20

const SDK_PROMPT = `${CODE_SYSTEM_PROMPT}
- 用户的任务数据通过 ${TASKFLOW_PREFIX} 开头的工具访问。`

/**
 * 第 29 章的代码工具，包装成 Agents SDK 的函数工具。
 * 实现一行没改（profile.runTool 就是 runCodeTool），区别只是"谁来调用它"：以前是我们的循环，现在是 SDK 的 Runner。
 */
function createCodeTools(code, { emit, mapper, signal, hashes }) {
  return code.tools.map((def) =>
    tool({
      name: def.name,
      description: def.description,
      // 教程（Claude）格式的 JSON Schema 原样交给 SDK。没有按 strict 模式的要求写，所以 strict: false
      parameters: def.input_schema,
      strict: false,
      // 要不要先问人：还是第 30 章 permissions.js 那张表说了算
      needsApproval: needsApproval(def.name),
      async execute(input, _context, details) {
        const id = details?.toolCall?.callId ?? ''
        const result = await code.runTool(def.name, input, {
          signal,
          // 批准时核对过的文件指纹（第 31 章）。文件在审批期间被改过，这次修改会被拒绝
          expectedHash: hashes.get(id),
          // 第 32 章：命令的实时输出照样推给终端面板
          onOutput: (stream, chunk) => emit('tool_output', { toolUseId: id, stream, chunk }),
        })
        mapper.setOutcome(id, {
          ok: result.ok,
          summary: result.summary,
          invalidate: result.ok ? (code.invalidation(def.name, result) ?? undefined) : undefined,
        })
        return toResultContent(result)
      },
    }),
  )
}

/**
 * @param {object} args
 * @param {Array<{ role: string, content: string }>} args.messages 纯文本历史
 * @param {(event: string, data: object) => void} args.emit 发一条 SSE 事件
 * @param {AbortSignal} args.signal 客户端断开 / 用户停止
 * @param {import('@openai/agents').Model} [args.model] 默认是真正的 OpenAI 模型；Mock 模式传 createMockSdkModel()
 */
export async function runSdkAgent({ messages, emit, signal, model }) {
  // 同一个代码助手：工具、执行函数、diff、刷新规则都从第 29 章的 profile 里拿
  const code = getProfile('code')
  const mapper = createSdkEventMapper()
  const push = (events) => events.forEach((e) => emit(e.event, e.data))
  /** callId → 批准时那份 diff 对应的文件指纹 */
  const hashes = new Map()

  // 真实模式：让 SDK 用我们配好的 OpenAI 客户端（同一个 key、同一个 base URL）。
  // SDK 默认走 Responses API —— 在那里推理和函数工具可以一起用（第 25 章 Chat Completions 里不行）
  if (!model) setDefaultOpenAIClient(getClient())

  const taskflow = new InProcessMcpServer('taskflow', createTaskflowMcpServer)
  await taskflow.connect()

  const agent = new Agent({
    name: 'TaskFlow 代码助手',
    instructions: SDK_PROMPT,
    model: model ?? MODEL,
    tools: createCodeTools(code, { emit, mapper, signal, hashes }),
    mcpServers: [taskflow],
    // 工具名带上服务器名（mcp_taskflow__list_tasks），一眼看出它来自哪个 MCP 服务器，也不会和别的工具重名
    mcpConfig: { includeServerInToolNames: true },
    // ⚠️ 编码工具必须一个一个来（第 29 章）：两个 edit_file 同时改同一个文件，后写的会覆盖先写的。
    //    手写循环是自己串行执行；这里干脆让模型一次只调一个工具
    modelSettings: { parallelToolCalls: false },
  })

  /**
   * Runner 停在一个要问人的工具前（interruption）。我们在这里接上第 30 章的审批 Map ——
   * 前端看到的还是同一张 ApprovalCard，点的还是同一个 POST /chat/approvals/:id。
   */
  async function decide(item, state) {
    const { callId: id, name } = item.rawItem
    const input = JSON.parse(item.rawItem.arguments || '{}')
    push(mapper.startTool(id, name, input))

    // 第 31 章：先把改动算出来。改动本身不成立的话直接拒绝，不打扰用户
    const plan = code.preview ? await code.preview(name, input) : null
    if (plan && !plan.ok) {
      mapper.setOutcome(id, { ok: false, summary: `失败：${plan.error}` })
      state.reject(item, { message: JSON.stringify({ error: plan.error }) })
      return
    }

    // 用户停止 / 断开时这里会 reject(AbortError)，一路抛到外面
    const decision = await requestApproval(
      { toolUseId: id, name, input, reason: approvalReason(name, input), preview: plan?.preview },
      { emit, signal },
    )

    if (decision.decision === 'allow') {
      if (plan?.baseHash) hashes.set(id, plan.baseHash)
      state.approve(item)
    } else {
      // 和手写引擎对模型说一样的话（toolRunner.js 的 deniedResult）
      const denied = deniedResult(decision)
      mapper.setOutcome(id, { ok: false, summary: denied.summary })
      state.reject(item, { message: JSON.stringify({ error: denied.error }) })
    }
  }

  try {
    // 我们的历史是纯文本（第 21 章）。和 Claude Agent SDK 只收一段 prompt 不同，
    // run() 直接收消息列表，用 user() / assistant() 造出来就行
    const input = messages.map((m) => (m.role === 'user' ? user(m.content) : assistant(m.content)))
    let result = await run(agent, input, { stream: true, signal, maxTurns: MAX_TURNS })

    for (;;) {
      for await (const event of result) push(mapper.map(event))
      await result.completed
      if (signal.aborted) return

      // 没有要问人的工具 = 这一轮跑完了
      if (result.interruptions.length === 0) break
      // 一个一个问（parallelToolCalls 关掉了，通常只有一个）。问完带着同一个 state 接着跑
      for (const item of result.interruptions) await decide(item, result.state)
      result = await run(agent, result.state, { stream: true, signal, maxTurns: MAX_TURNS })
    }

    emit('done', { stopReason: 'end_turn', usage: toWireUsage(result.runContext.usage) })
  } catch (err) {
    // 用户停止 / 断开：安静地结束
    if (signal.aborted) return
    if (err instanceof MaxTurnsExceededError) {
      emit('error', { kind: 'input', message: '操作步骤太多，已停止。请把需求拆成几步分别说。' })
      return
    }
    // 其余的（key 无效、模型不存在、限流……）交给路由的 classifyError，和手写引擎一样分类
    throw err
  } finally {
    await taskflow.close()
  }
}
