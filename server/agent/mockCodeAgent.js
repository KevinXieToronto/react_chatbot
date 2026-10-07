import { sleep, typeOut } from './stream.js'

/** Mock 新建文件时用的默认内容 */
const CLAMP_SOURCE = `/** 把 n 限制在 [min, max] 区间内 */
export function clamp(n, min, max) {
  return Math.min(Math.max(n, min), max)
}
`

/** 工具被拒绝 / 审批超时后，"模型"该怎么接话 */
function refusedText(r) {
  if (r.by === 'timeout') {
    return '你一直没有确认，审批超时自动拒绝了，这一步我先不做。需要的话再告诉我一次。'
  }
  return r.note
    ? `好的，这一步我不做了。你的备注是「${r.note}」，我会照这个来 —— 你可以告诉我下一步想怎么做。`
    : '好的，这一步我不做了。如果你希望换一种改法，直接告诉我。'
}

/**
 * 从 node --test 的输出里挑出每个用例的结果和汇总行。
 * 依赖 spec 格式（✔ / ✖ / ℹ）：Node 22 输出不是终端时默认是 TAP，
 * 所以 workspace/package.json 的 test 脚本写了 --test-reporter=spec（第 29 章）。
 */
function testSummary(text) {
  const picked = []
  for (const line of text.split(/\r?\n/)) {
    const isCase = /^[✔✖] /.test(line) && !line.includes('failing tests')
    // 失败的用例会在末尾"failing tests:"里再列一遍，去重
    if ((isCase || /^ℹ (pass|fail) /.test(line)) && !picked.includes(line)) picked.push(line)
  }
  return picked.length > 0 ? picked.join('\n') : text.trimEnd().split('\n').slice(-10).join('\n')
}

/**
 * Mock 模式的"假编码 Agent"。
 *
 * 和任务版一样：用关键词代替模型做判断，但【工具是真的执行】——
 * 读的是真文件，改的也是真文件，沙箱拦截、审批等待也都是真的。
 *
 * 第 30 章起，create_file / edit_file / run_command 会先停下来等你批准；
 * 被拒绝时工具返回 { denied: true, note }，剧本据此"改变主意"，模拟模型的反应。
 *
 * @param {{ res, signal, callTool }} ctx
 * @param {string} userText
 */
export async function mockCodeAgent({ res, signal, callTool }, userText) {
  const t = String(userText ?? '')
  const call = (name, input) => callTool(`mock_${crypto.randomUUID().slice(0, 8)}`, name, input)
  const say = (text) => typeOut(res, text, signal)

  // ⓪ 演示：命令不受路径沙箱限制
  if (/(用命令|命令行).*(\.env|server)/.test(t)) {
    const r = await call('run_command', { command: 'type ..\\server\\.env' })
    if (r.denied) return say(refusedText(r))
    return say(
      `命令执行了：\n\n\`\`\`\n${r.ok ? r.data : r.error}\n\`\`\`\n\n` +
        '注意：`read_file` 读 `../server/.env` 会被沙箱拦下，但 **shell 命令不受那套路径检查约束** —— ' +
        '它能做到服务端进程能做的任何事。所以 run_command 必须经过你的批准。',
    )
  }

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
    if (r.denied) return say(refusedText(r))
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
    if (r2.denied) return say(refusedText(r2))
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
    if (r3.denied) return say(refusedText(r3))
    return say(
      r3.ok
        ? '✅ 修好了：`sum` 现在从第一个元素开始累加，`max` 没有被误改。说"跑一下测试"验证一下？'
        : `还是没改成：${r3.error}`,
    )
  }

  // ④ 跑测试："跑一下测试"
  if (/测试|跑一下|运行|npm|run/i.test(t)) {
    const r = await call('run_command', { command: 'npm test' })
    if (r.denied) return say(refusedText(r))
    if (!r.ok) return say(`命令没跑成：${r.error}`)

    const passed = r.data.includes('（退出码 0）')
    return say(
      (passed ? '✅ 测试全部通过：' : '❌ 有测试没通过：') +
        `\n\n\`\`\`\n${testSummary(r.data)}\n\`\`\`` +
        (passed ? '' : '\n\n要我修吗？说"帮我修复 bug"。'),
    )
  }

  // ⑤ 搜索："搜索 nums"
  const searchMatch = t.match(/(?:搜索|查找|搜一下|search)\s*[：:]?\s*(\S+)/i)
  if (searchMatch) {
    const r = await call('search', { query: searchMatch[1] })
    return say(r.ok ? `${r.summary}：\n\n\`\`\`\n${r.data}\n\`\`\`` : `搜索失败：${r.error}`)
  }

  // ⑥ 读文件："看看 src/math.js"
  const readMatch = t.match(/(?:看看|读一下|读|打开|read)\s*[：:]?\s*([\w./-]+\.\w+)/i)
  if (readMatch) {
    const r = await call('read_file', { path: readMatch[1] })
    return say(
      r.ok ? `这是 \`${readMatch[1]}\` 的内容（左边是行号）：\n\n\`\`\`\n${r.data}\n\`\`\`` : `读不了：${r.error}`,
    )
  }

  // ⑦ 列文件
  if (/列出|有哪些文件|文件列表|目录|结构|list/i.test(t)) {
    const r = await call('list_files', { path: '.' })
    return say(r.ok ? `工作区里有这些文件：\n\n\`\`\`\n${r.data}\n\`\`\`` : `列不出来：${r.error}`)
  }

  return say(
    '（Mock 模式）我是代码助手，只能读写 `workspace/` 里的文件。试试：\n\n' +
      '· "列出文件"\n· "看看 src/math.js"\n· "搜索 nums"\n· "帮我修复 bug"\n· "跑一下测试"\n' +
      '· "新建文件 src/clamp.js"\n· "读一下 ../server/.env"（演示沙箱）\n· "用命令看看 ../server/.env"（演示命令为什么必须审批）',
  )
}
