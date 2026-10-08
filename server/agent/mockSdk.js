import { sleep } from './stream.js'
import { TASKFLOW_PREFIX } from './sdkMapper.js'
import { responseStarted, textDelta, assistantMessage, functionCall, responseDone } from './sdkMessages.js'

/**
 * 【Mock 专用】给 OpenAI Agents SDK 用的"脚本化假模型"（第 34 章）。
 *
 * 教程里 Claude Agent SDK 的替身是"回放一段 SDK 消息的录像"，因为那个 SDK 要起一个 Claude Code 进程，
 * 没有 key 什么都跑不起来。OpenAI Agents SDK 不一样：它就是个普通的库，模型只是其中可以替换的一块
 * （实现 Model 接口：getResponse / getStreamedResponse）。所以这里只替换"模型"：
 * Runner 的循环、工具审批（needsApproval → 中断 → 批准 / 拒绝 → 继续跑）、MCP 调用、
 * 工具执行（读真文件、写真文件、查真任务）全都是真的。
 *
 * 和第 33 章的 scriptedClient 是同一个思路，只是这次换的是 Agents SDK 里的模型。
 * 回答前面都带"（Mock 回放）"，别把它当成模型的真实表现。
 */

const NEED_KEY =
  '（Mock 回放）**OpenAI Agents SDK 引擎需要接上真正的模型，才能自己决定下一步做什么。**' +
  '没有 key 时，这里只有几段写好的剧本，用来检查事件映射、审批和 MCP 是不是接对了。试试：\n\n' +
  '· "读一下 README.md"\n· "我还有哪些任务没做完"（MCP 工具）\n· "新建 notes.md"（会弹审批）\n' +
  '· "用命令打个招呼"（会弹审批）\n· "读一下 ../server/.env"（越界，被沙箱拦下）\n\n' +
  '要用真正的模型：在 server/.env 里设 MOCK=0 并填上 OPENAI_API_KEY。'

/** 我们的工具失败时交回 {"error": "..."}（代码工具、MCP 工具、审批拒绝都是） */
function errorOf(text) {
  try {
    return JSON.parse(text)?.error ?? null
  } catch {
    return null
  }
}

/** 按关键词选剧本：每个剧本 = 一次工具调用 + 根据结果说的一句话 */
function pickScript(text) {
  if (/\.env|越界/.test(text)) {
    return {
      tool: 'read_file',
      input: { path: '../server/.env' },
      reply: (r, err) =>
        err ? `被拦下了：${err}\n\n这是第 29 章的工作区沙箱，换了引擎照样生效 —— 工具还是我们自己的。` : '……读到了？那说明沙箱有漏洞。',
    }
  }
  if (/任务/.test(text)) {
    return {
      tool: `${TASKFLOW_PREFIX}list_tasks`,
      input: { status: 'todo' },
      reply: (r, err) =>
        err ? `没查到：${err}` : `这是通过 MCP 工具 \`${TASKFLOW_PREFIX}list_tasks\` 查到的：\n\n\`\`\`json\n${r}\n\`\`\``,
    }
  }
  if (/新建|写/.test(text)) {
    // "新建 todo.md" → todo.md；没写文件名就是 notes.md
    const path = text.match(/[\w./-]+\.\w+/)?.[0] ?? 'notes.md'
    return {
      tool: 'create_file',
      input: { path, content: '# 笔记\n\n这个文件是 OpenAI Agents SDK 引擎（Mock 回放）写的。\n' },
      reply: (r, err) =>
        err ? `没写成：${err}` : `写好了 \`${path}\`，右边的文件树里应该已经有它了。`,
    }
  }
  if (/命令|echo/.test(text)) {
    return {
      tool: 'run_command',
      input: { command: 'echo hello from agents sdk' },
      reply: (r, err) => (err ? `没跑成：${err}` : '命令跑完了，输出在右边的终端标签里。'),
    }
  }
  if (/读|README/i.test(text)) {
    return {
      tool: 'read_file',
      input: { path: 'README.md' },
      reply: (r, err) => (err ? `没读成：${err}` : `读完了 README.md，一共 ${r.split('\n').length} 行。`),
    }
  }
  return null
}

/** 一个输入条目里的文字（user(...) 造出来的 content 可能是字符串，也可能是 input_text 数组） */
function textOf(item) {
  if (typeof item?.content === 'string') return item.content
  return (item?.content ?? []).map((c) => c.text ?? '').join('')
}

/** 工具结果条目的输出文本。MCP 工具的结果会被 SDK 转成 [{ type: 'input_text', text }] 这样的数组 */
function outputOf(item) {
  const out = item.output
  if (typeof out === 'string') return out
  return (Array.isArray(out) ? out : [out]).map((part) => part?.text ?? '').join('')
}

/** @returns {import('@openai/agents').Model} */
export function createMockSdkModel() {
  let n = 0

  return {
    async getResponse() {
      throw new Error('Mock 模型只支持流式调用')
    },

    async *getStreamedResponse(request) {
      const items = typeof request.input === 'string' ? [{ role: 'user', content: request.input }] : request.input
      const lastUser = items.findLast((item) => item.role === 'user')
      const script = pickScript(textOf(lastUser))
      const last = items.at(-1)

      let say
      const output = []
      if (!script) {
        say = NEED_KEY
      } else if (last?.type === 'function_call_result') {
        // 第二次调用：工具结果回来了，根据结果说一句
        const result = outputOf(last)
        say = script.reply(result, errorOf(result))
      } else {
        // 第一次调用：先说一句，再调工具
        say = '（Mock 回放）好的。'
        output.push(functionCall(`call_mock_${crypto.randomUUID().slice(0, 8)}`, script.tool, script.input))
      }

      // 像真的模型一样一小段一小段地"说"
      yield responseStarted()
      for (const piece of say.match(/[\s\S]{1,4}/g) ?? []) {
        if (request.signal?.aborted) throw new DOMException('已中止', 'AbortError')
        yield textDelta(piece)
        await sleep(20)
      }
      n += 1
      yield responseDone(`resp_mock_${n}`, [assistantMessage(`msg_mock_${n}`, say), ...output])
    },
  }
}
