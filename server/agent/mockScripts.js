/**
 * 【Mock 专用】给脚本化假模型（scriptedClient.js）用的剧本（第 33 章）。
 *
 * 和 mockCodeAgent 的区别：mockCodeAgent 自己调工具、自己说话，完全不经过 runAgentLoop；
 * 这里的剧本只决定"模型下一步想干什么"，真正的循环、上下文管理都是真的。
 *
 * 返回 null 表示"这句话没有对应的剧本"，路由会退回到老的 Mock。
 */

/** 最后一条消息如果是工具结果（role 为 tool），取出它的文本 */
function lastToolResult(params) {
  const last = params.messages.at(-1)
  return last?.role === 'tool' ? String(last.content) : null
}

/**
 * 代码助手："把所有文件都读一遍"。
 * 先 list_files，再一个一个 read_file —— 上下文一轮比一轮大，正好用来观察上下文管理。
 */
export function codeMockScript(userText) {
  const t = String(userText ?? '')
  if (!/(所有|全部)文件|上下文/.test(t)) return null

  let files = null
  let next = 0

  return (params) => {
    if (files === null) {
      const listing = lastToolResult(params)
      if (listing === null) {
        return { text: '好的，我先看看工作区里有哪些文件。', toolUses: [{ name: 'list_files', input: {} }] }
      }
      // list_files 的每一行是 "路径  (大小 B)"
      files = listing
        .split('\n')
        .filter((line) => line.includes('  ('))
        .map((line) => line.split('  (')[0])
    }

    if (next < files.length) {
      const path = files[next]
      next += 1
      return {
        text: next === 1 ? `一共 ${files.length} 个文件，我一个一个读。` : '',
        toolUses: [{ name: 'read_file', input: { path } }],
      }
    }

    return {
      text:
        `读完了，一共 ${files.length} 个文件。每读一个，发给模型的上下文就大一截 —— ` +
        '看看输入框上面的上下文条：token 数一轮比一轮多；超过 1024 token 以后，缓存读取的数字也在涨，' +
        '因为每一轮的请求都以上一轮为前缀。\n\n' +
        '如果你用 `set CONTEXT_BUDGET_TOKENS=2500` 调小了预算，还会看到"截断了几个旧工具结果""移除了几条旧消息"。',
    }
  }
}
