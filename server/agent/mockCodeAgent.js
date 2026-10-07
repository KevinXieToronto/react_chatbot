import { sleep, typeOut } from './stream.js'

/** Mock 新建文件时用的默认内容 */
const CLAMP_SOURCE = `/** 把 n 限制在 [min, max] 区间内 */
export function clamp(n, min, max) {
  return Math.min(Math.max(n, min), max)
}
`

/**
 * Mock 模式的"假编码 Agent"。
 *
 * 和任务版一样：用关键词代替模型做判断，但【工具是真的执行】——
 * 读的是真文件，改的也是真文件，沙箱拦截也是真的。
 * 所以没有 API Key 也能完整体验编码 Agent 的前端交互。
 *
 * @param {{ res, signal, callTool }} ctx
 * @param {string} userText
 */
export async function mockCodeAgent({ res, signal, callTool }, userText) {
  const t = String(userText ?? '')
  const call = (name, input) => callTool(`mock_${crypto.randomUUID().slice(0, 8)}`, name, input)
  const say = (text) => typeOut(res, text, signal)

  // ① 演示沙箱：故意去读工作区外面的文件
  if (/越界|\.\.[\\/]|\.env/.test(t)) {
    const path = t.match(/\.\.[\\/][\w./\\-]*/)?.[0] ?? '../server/.env'
    const r = await call('read_file', { path })
    return say(
      r.ok
        ? '……居然读到了？那说明沙箱有漏洞，赶紧检查 resolveInWorkspace！'
        : `我试着读 \`${path}\`，被服务端拦下了：\n\n> ${r.error}\n\n` +
            '这就是沙箱的意义：不管模型（或者藏在代码注释里的提示注入）让我读什么，服务端只认工作区里面的路径。',
    )
  }

  // ② 新建文件："新建文件 src/clamp.js"
  const createMatch = t.match(/(?:新建|创建)\s*(?:一个)?\s*文件\s*[：:]?\s*([\w./-]+)?/)
  if (createMatch) {
    const path = createMatch[1] ?? 'src/clamp.js'
    const r = await call('create_file', { path, content: CLAMP_SOURCE })
    return say(
      r.ok
        ? `${r.summary}。右边的文件树里应该已经出现它了。`
        : `没建成：${r.error}\n\n（想再演示一次，换个文件名，比如"新建文件 src/clamp2.js"。）`,
    )
  }

  // ③ 修 bug：读文件 → 第一次编辑因为不唯一而失败 → 带上下文重试
  if (/修复|修一下|修 ?bug|fix/i.test(t)) {
    const r1 = await call('read_file', { path: 'src/math.js' })
    if (!r1.ok) return say(`读文件失败：${r1.error}`)

    // read_file 返回的是"行号<TAB>内容"，所以正则里要跳过行号
    const buggy = /let total = 0\n\s*\d+\t\s*for \(let i = 1;/.test(r1.data)
    if (!buggy) {
      return say(
        '我看了一下 `src/math.js`，`sum` 的循环已经不是从 `i = 1` 开始了，bug 应该修过了。' +
          '想重来一次，把 `workspace/src/math.js` 恢复成第 29 章给的内容就行。',
      )
    }

    await sleep(300)
    if (!(await say('`sum` 的循环从 `i = 1` 开始，漏掉了第一个元素。我先直接改这一行：\n\n'))) return false

    const r2 = await call('edit_file', {
      path: 'src/math.js',
      old_str: 'for (let i = 1; i < nums.length; i++) {',
      new_str: 'for (let i = 0; i < nums.length; i++) {',
    })
    if (r2.ok) return say('改好了。')

    await sleep(300)
    if (
      !(await say(
        `失败了：${r2.error}\n\n确实 —— \`max\` 里也有一模一样的一行（它从 1 开始是对的）。` +
          '我把上一行 `let total = 0` 也带上，让匹配变成唯一的：\n\n',
      ))
    ) {
      return false
    }

    const r3 = await call('edit_file', {
      path: 'src/math.js',
      old_str: '  let total = 0\n  for (let i = 1; i < nums.length; i++) {',
      new_str: '  let total = 0\n  for (let i = 0; i < nums.length; i++) {',
    })
    return say(
      r3.ok
        ? '✅ 修好了：`sum` 现在从第一个元素开始累加，`max` 没有被误改。右边的文件面板已经刷新了。'
        : `还是没改成：${r3.error}`,
    )
  }

  // ④ 搜索："搜索 nums"
  const searchMatch = t.match(/(?:搜索|查找|搜一下|search)\s*[：:]?\s*(\S+)/i)
  if (searchMatch) {
    const r = await call('search', { query: searchMatch[1] })
    return say(r.ok ? `${r.summary}：\n\n\`\`\`\n${r.data}\n\`\`\`` : `搜索失败：${r.error}`)
  }

  // ⑤ 读文件："看看 src/math.js"
  const readMatch = t.match(/(?:看看|读一下|读|打开|read)\s*[：:]?\s*([\w./-]+\.\w+)/i)
  if (readMatch) {
    const r = await call('read_file', { path: readMatch[1] })
    return say(
      r.ok ? `这是 \`${readMatch[1]}\` 的内容（左边是行号）：\n\n\`\`\`\n${r.data}\n\`\`\`` : `读不了：${r.error}`,
    )
  }

  // ⑥ 列文件
  if (/列出|有哪些文件|文件列表|目录|结构|list/i.test(t)) {
    const r = await call('list_files', { path: '.' })
    return say(r.ok ? `工作区里有这些文件：\n\n\`\`\`\n${r.data}\n\`\`\`` : `列不出来：${r.error}`)
  }

  return say(
    '（Mock 模式）我是代码助手，只能读写 `workspace/` 里的文件。试试：\n\n' +
      '· "列出文件"\n· "看看 src/math.js"\n· "搜索 nums"\n· "帮我修复 bug"\n' +
      '· "新建文件 src/clamp.js"\n· "读一下 ../server/.env"（演示沙箱）',
  )
}
