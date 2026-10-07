import { sleep, typeOut } from './stream.js'

/**
 * 把任意文本转义成 Markdown 里的"纯文字"（第 28 章）。
 * 任务标题是用户填的，原样拼进 Markdown 的话：标题里的 | 会把表格拆坏，
 * [点我](https://...) 会变成一个真链接，![](...) 会变成一张图（第 27 章）。
 */
function escapeMd(text) {
  return String(text).replace(/[\\`*_{}[\]()#+\-.!|<>~]/g, '\\$&')
}

/**
 * Mock 模式的"假任务 Agent"：用关键词匹配代替模型判断，
 * 但【工具是真的执行】—— 所以创建/完成任务会真的改数据。
 *
 * 内容和第 25~28 章 routes/chat.js 里的 mockAgent 一样，只是搬了家，
 * 并且改成通过 callTool 执行工具（tool_start / tool_end / invalidate 由它统一发）。
 *
 * @param {{ res, signal, callTool }} ctx
 * @param {string} userText 最后一条用户消息
 * @returns {Promise<boolean>} 是否完整输出（被中止时返回 false）
 */
export async function mockTaskAgent({ res, signal, callTool }, userText) {
  const t = String(userText ?? '')
  const toolId = () => `mock_${crypto.randomUUID().slice(0, 8)}`
  const say = (text) => typeOut(res, text, signal)

  // "创建任务：xxx" / "加个任务 xxx"
  const createMatch = t.match(/(?:新建|创建|加个?|添加)\s*(?:一个)?\s*任务[：:，,\s]*(.+)/)
  if (createMatch) {
    const title = createMatch[1].trim().replace(/[。.！!]$/, '')
    const result = await callTool(toolId(), 'create_task', { title })

    await sleep(200)
    return say(
      result.ok
        ? `好的，${result.summary}。你可以在看板上看到它了。`
        : `没能创建成功：${result.error}`,
    )
  }

  // 查询类
  if (/任务|待办|没做完|未完成|多少|哪些/.test(t)) {
    const status = /没做完|未完成|待办|todo/.test(t) ? 'todo' : 'all'
    const result = await callTool(toolId(), 'list_tasks', { status })

    await sleep(200)

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

    return say(text)
  }

  if (/代码|code|示例/.test(t)) {
    return say(
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
    )
  }

  return say(
    `（Mock 模式）我可以真的帮你操作任务，试试：\n\n· "我还有哪些任务没做完"\n· "帮我加个任务：买咖啡豆"\n\n要用真正的 OpenAI，改 server/.env 里的 MOCK=0 并填 OPENAI_API_KEY。`,
  )
}
