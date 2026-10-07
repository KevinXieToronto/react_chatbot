import { Router } from 'express'
import { isMock } from '../agent/openai.js'
import { runAgentLoop } from '../agent/loop.js'
import { runTool, isMutatingTool } from '../agent/tools.js'
import { validateMessages } from '../validate.js'

export const chatRouter = Router()

function sse(res, event, data) {
  res.write(`event: ${event}\n`)
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

function openStream(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.flushHeaders?.()
}

/**
 * 把任意文本转义成 Markdown 里的"纯文字"。
 * 任务标题是用户填的，原样拼进 Markdown 的话：标题里的 | 会把表格拆坏，
 * [点我](https://...) 会变成一个真链接，![](...) 会变成一张图（第 27 章）。
 * 在每个 Markdown 标点前加反斜杠，它们就只是普通字符了。
 */
function escapeMd(text) {
  return String(text).replace(/[\\`*_{}[\]()#+\-.!|<>~]/g, '\\$&')
}

/** 把一段文字一个字一个字地推出去 */
async function typeOut(res, text, signal) {
  let i = 0
  while (i < text.length) {
    if (signal.aborted || res.writableEnded || res.destroyed) return false
    const size = 1 + Math.floor(Math.random() * 3)
    sse(res, 'delta', { text: text.slice(i, i + size) })
    i += size
    await new Promise((r) => setTimeout(r, 22))
  }
  return true
}

/**
 * Mock 模式的"假 Agent"：用关键词匹配代替模型判断，
 * 但【工具是真的执行】—— 所以创建/完成任务会真的改数据。
 * 这样没有 API Key 也能完整体验工具调用的前端交互。
 */
async function mockAgent(res, userText, signal) {
  const t = String(userText ?? '')
  const toolId = () => `mock_${crypto.randomUUID().slice(0, 8)}`

  // "创建任务：xxx" / "加个任务 xxx"
  const createMatch = t.match(/(?:新建|创建|加个?|添加)\s*(?:一个)?\s*任务[：:，,\s]*(.+)/)
  if (createMatch) {
    const title = createMatch[1].trim().replace(/[。.！!]$/, '')
    const id = toolId()

    sse(res, 'tool_start', { id, name: 'create_task', input: { title } })
    await new Promise((r) => setTimeout(r, 500))
    const result = await runTool('create_task', { title })
    sse(res, 'tool_end', { id, ok: result.ok, summary: result.summary })

    // 数据变了，通知前端刷新缓存。
    // 带上 task 对象，前端可以直接乐观地插进列表，不用等重新请求。
    // op 用工具名，和下面真实分支保持一致
    if (result.ok) {
      sse(res, 'invalidate', { resource: 'tasks', op: 'create_task', task: result.task })
    }

    await new Promise((r) => setTimeout(r, 200))
    return typeOut(
      res,
      result.ok
        ? `好的，${result.summary}。你可以在看板上看到它了。`
        : `没能创建成功：${result.error}`,
      signal,
    )
  }

  // 查询类
  if (/任务|待办|没做完|未完成|多少|哪些/.test(t)) {
    const id = toolId()
    const status = /没做完|未完成|待办|todo/.test(t) ? 'todo' : 'all'

    sse(res, 'tool_start', { id, name: 'list_tasks', input: { status } })
    await new Promise((r) => setTimeout(r, 600))
    const result = await runTool('list_tasks', { status })
    sse(res, 'tool_end', { id, ok: result.ok, summary: result.summary })

    await new Promise((r) => setTimeout(r, 200))

    const list = result.data ?? []
    const text =
      list.length === 0
        ? '你现在没有符合条件的任务。'
        : `你有 **${list.length}** 条任务：\n\n` +
          '| 标题 | 优先级 | 状态 |\n' +
          '| --- | --- | --- |\n' +
          // 标题是用户数据，必须转义后再拼进 Markdown
          list.map((x) => `| ${escapeMd(x.title)} | \`${x.priority}\` | ${x.status} |`).join('\n') +
          '\n\n> Mock 模式：工具是真的执行了，只有"模型的判断"是关键词匹配的。\n\n' +
          '想看代码块渲染效果，问我 "给我看段代码"。'

    return typeOut(res, text, signal)
  }

  if (/代码|code|示例/.test(t)) {
    return typeOut(
      res,
      '好的，这是一个 React 组件的例子：\n\n' +
        '```tsx\n' +
        'function TaskCard({ task }: { task: Task }) {\n' +
        '  const isDone = task.status === "done"\n' +
        '  return (\n' +
        '    <div className={isDone ? "line-through" : ""}>\n' +
        '      {task.title}\n' +
        '    </div>\n' +
        '  )\n' +
        '}\n' +
        '```\n\n' +
        '注意代码块右上角有**复制**按钮（鼠标悬停时出现）。行内代码长这样：`const x = 1`。',
      signal,
    )
  }

  return typeOut(
    res,
    `（Mock 模式）我可以真的帮你操作任务，试试：\n\n· "我还有哪些任务没做完"\n· "帮我加个任务：买咖啡豆"\n\n要用真正的 OpenAI，改 server/.env 里的 MOCK=0 并填 OPENAI_API_KEY。`,
    signal,
  )
}

chatRouter.post('/', async (req, res) => {
  const { messages } = req.body ?? {}

  const invalid = validateMessages(messages)
  if (invalid) return res.status(400).json({ message: invalid })

  openStream(res)

  const abort = new AbortController()
  // ⚠️ 用 res.on('close')，不是 req.on('close')：req 是请求体的可读流，
  //    请求体（这几十字节的 JSON）读完就会触发它的 close，几乎和进入这个
  //    处理函数同时发生，跟客户端是否断开无关。必须监听 res 的 close。
  res.on('close', () => {
    if (res.writableFinished) return // 正常结束也会触发 close，不算中断
    console.log('[chat] 客户端断开，停止生成')
    abort.abort()
  })

  try {
    if (isMock()) {
      const lastUser = [...messages].reverse().find((m) => m.role === 'user')
      await new Promise((r) => setTimeout(r, 250))
      const finished = await mockAgent(res, lastUser?.content, abort.signal)
      if (finished && !abort.signal.aborted) {
        sse(res, 'done', { stopReason: 'end_turn' })
      }
      return res.end()
    }

    const result = await runAgentLoop(
      messages,
      {
        onText: (delta) => sse(res, 'delta', { text: delta }),
        onToolStart: (info) => sse(res, 'tool_start', info),
        onToolEnd: (info) => {
          sse(res, 'tool_end', { id: info.id, ok: info.ok, summary: info.summary })
          if (info.ok && isMutatingTool(info.name)) {
            sse(res, 'invalidate', { resource: 'tasks', op: info.name, task: info.task })
          }
        },
      },
      abort.signal,
    )

    if (abort.signal.aborted) return res.end()

    if (result.stopReason === 'refusal') {
      sse(res, 'error', { message: '抱歉，这个请求我没法处理。' })
    } else if (result.stopReason === 'truncated') {
      sse(res, 'error', { message: '回复被长度限制截断了，请把问题拆小一点再试。' })
    } else if (result.stopReason === 'max_turns') {
      sse(res, 'error', { message: '操作步骤太多，已停止。请把需求拆成几步分别说。' })
    } else {
      sse(res, 'done', { stopReason: result.stopReason, usage: result.usage })
    }

    res.end()
  } catch (err) {
    // 客户端断开引起的 APIUserAbortError（OpenAI SDK 也是这个名字）是我们自己取消的，不是错误（见第 22 章）
    if (abort.signal.aborted) return

    console.error('[chat] 出错：', err)
    if (!res.writableEnded) {
      sse(res, 'error', { message: err?.status === 401 ? 'API Key 无效' : '调用模型失败' })
      res.end()
    }
  }
})
