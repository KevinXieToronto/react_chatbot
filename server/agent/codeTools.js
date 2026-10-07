import fs from 'node:fs/promises'
import path from 'node:path'
import {
  WorkspaceError,
  listWorkspaceFiles,
  readTextFile,
  resolveInWorkspace,
  toRel,
} from './workspace.js'

/** read_file 一次最多返回多少行 */
const MAX_READ_LINES = 400
/** search 最多返回多少条结果 */
const MAX_SEARCH_RESULTS = 50
/** create_file / edit_file 写入内容的上限 */
const MAX_WRITE_CHARS = 200_000

/**
 * 编码 Agent 的工具定义。
 * 和任务工具一样：description 写给模型看，决定了它什么时候用、怎么填参数。
 */
export const codeToolDefinitions = [
  {
    name: 'list_files',
    description: '列出工作区里的文件（递归）。不知道项目结构时先调用它。路径都相对于工作区根目录。',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '从哪个目录开始列，默认 "." 即工作区根目录' },
      },
    },
  },
  {
    name: 'read_file',
    description:
      '读取一个文本文件，返回带行号的内容（格式："行号<TAB>内容"）。' +
      '行号只是给你定位用的，不是文件内容的一部分 —— 调用 edit_file 时 old_str 里绝对不要带行号。' +
      `一次最多返回 ${MAX_READ_LINES} 行，文件更长时用 start_line 分段读。`,
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '相对于工作区的文件路径，例如 src/math.js' },
        start_line: { type: 'integer', description: '从第几行开始读（从 1 开始），默认 1' },
      },
      required: ['path'],
    },
  },
  {
    name: 'search',
    description:
      '在工作区所有文本文件里搜索。默认按普通字符串匹配，is_regex=true 时按 JavaScript 正则匹配。' +
      `返回 "路径:行号: 该行内容"，最多 ${MAX_SEARCH_RESULTS} 条。`,
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '要搜索的内容' },
        is_regex: { type: 'boolean', description: '是否把 query 当正则，默认 false' },
      },
      required: ['query'],
    },
  },
  {
    name: 'create_file',
    description:
      '新建一个文件并写入完整内容。目标文件已存在时会失败 —— 修改已有文件请用 edit_file。' +
      '需要的父目录会自动创建。',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '相对于工作区的新文件路径' },
        content: { type: 'string', description: '文件的完整内容' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'edit_file',
    description:
      '修改一个已有文件：把文件里的 old_str 替换成 new_str。' +
      'old_str 必须和文件内容逐字一致（包括空格、缩进），并且在文件里只出现一次；' +
      '如果出现多次，请在 old_str 里多带几行上下文让它唯一。' +
      '改之前先用 read_file 看当前内容，不要凭记忆写 old_str。',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '相对于工作区的文件路径' },
        old_str: { type: 'string', description: '要被替换的原文，必须在文件中唯一' },
        new_str: { type: 'string', description: '替换成的新内容' },
      },
      required: ['path', 'old_str', 'new_str'],
    },
  },
]

function ok(data, summary, extra = {}) {
  return { ok: true, data, summary, ...extra }
}
function fail(message) {
  return { ok: false, error: message, summary: `失败：${message}` }
}

/** 第 index 个字符在第几行（从 1 开始） */
function lineOf(text, index) {
  let line = 1
  for (let i = 0; i < index; i++) if (text[i] === '\n') line++
  return line
}

/**
 * 纯函数：在 content 里把唯一的 oldStr 换成 newStr。
 * 单独拆出来，是为了能不碰磁盘直接写单元测试。
 *
 * 返回 { ok: true, content, line } 或 { ok: false, error }
 */
export function applyEdit(content, oldStr, newStr) {
  if (typeof oldStr !== 'string' || oldStr === '') {
    return { ok: false, error: 'old_str 不能为空' }
  }
  if (typeof newStr !== 'string') {
    return { ok: false, error: '缺少 new_str' }
  }
  if (oldStr === newStr) {
    return { ok: false, error: 'old_str 和 new_str 完全一样，没有要改的' }
  }

  // Windows 上的文件多半是 CRLF 换行，模型写的 old_str 却总是 \n。
  // 统一成 \n 再匹配，写回时恢复成文件原来的换行风格。
  const eol = content.includes('\r\n') ? '\r\n' : '\n'
  const text = content.replace(/\r\n/g, '\n')
  const from = oldStr.replace(/\r\n/g, '\n')
  const to = newStr.replace(/\r\n/g, '\n')

  const positions = []
  for (let i = text.indexOf(from); i !== -1; i = text.indexOf(from, i + from.length)) {
    positions.push(i)
  }

  if (positions.length === 0) {
    return {
      ok: false,
      error:
        '没找到 old_str。它必须和文件内容逐字一致（包括空格和缩进），也不能带 read_file 输出里的行号。' +
        '请先用 read_file 看一下当前内容。',
    }
  }
  if (positions.length > 1) {
    const lines = positions.map((p) => lineOf(text, p)).join('、')
    return {
      ok: false,
      error:
        `old_str 在文件里出现了 ${positions.length} 次（第 ${lines} 行），不知道该改哪一处。` +
        '请在 old_str 里多带几行上下文，让它只匹配一处。',
    }
  }

  const at = positions[0]
  // ⚠️ 不要写 text.replace(from, to)：replace 会把 to 里的 $&、$1、$$ 当成特殊替换模式，
  //    模型写的代码里一旦有 "$&"（比如正则相关的代码），替换结果就是错的。
  const next = text.slice(0, at) + to + text.slice(at + from.length)

  return {
    ok: true,
    content: eol === '\r\n' ? next.replace(/\n/g, '\r\n') : next,
    line: lineOf(text, at),
  }
}

/**
 * 把用户（模型）给的字符串变成匹配函数。正则不合法时返回 null。
 *
 * ⚠️ 默认按【普通字符串】匹配（includes，相当于把正则特殊字符全部转义）。
 *    is_regex 是显式的 opt-in，而它有一个没法在这里解决的风险：ReDoS。
 *    像 (a+)+$ 这样的正则遇到特定输入会"灾难性回溯"，一行几十个字符就能跑上几分钟。
 *    JS 的正则是【同步】执行的：它跑着的时候整个事件循环都卡住，
 *    审批、中止、其他请求全都没反应 —— 也就没有任何定时器能打断它。
 *    query 限长 200 字挡不住这种正则；真要防，得把正则搜索放进 worker 线程、
 *    超时就 terminate()（第 29 章练习 5），或者换用保证线性时间的 RE2 引擎。
 */
function toMatcher(query, isRegex) {
  if (!isRegex) return (line) => line.includes(query)
  try {
    const re = new RegExp(query)
    return (line) => re.test(line)
  } catch {
    return null
  }
}

const executors = {
  async list_files(input) {
    const { files, truncated } = await listWorkspaceFiles(input.path || '.')
    const lines = files.map((f) => `${f.path}  (${f.size} B)`)
    if (truncated) lines.push('…（文件太多，只列出了前面一部分）')
    return ok(lines.join('\n') || '（空目录）', `列出 ${files.length} 个文件`)
  },

  async read_file(input) {
    const rel = String(input.path ?? '')
    const { content } = await readTextFile(rel)

    const all = content.split(/\r?\n/)
    const start = Math.max(1, Number.parseInt(input.start_line, 10) || 1)
    const slice = all.slice(start - 1, start - 1 + MAX_READ_LINES)

    // 格式模仿 cat -n：行号右对齐 + TAB + 原文
    let text = slice.map((line, i) => `${String(start + i).padStart(4)}\t${line}`).join('\n')
    const end = start + slice.length - 1
    if (end < all.length) {
      text += `\n…（共 ${all.length} 行，还有 ${all.length - end} 行没显示，用 start_line=${end + 1} 继续读）`
    }

    return ok(text, `读取 ${rel}（${all.length} 行）`)
  },

  async search(input) {
    const query = String(input.query ?? '')
    if (!query) return fail('缺少 query')
    if (query.length > 200) return fail('query 太长了')

    const match = toMatcher(query, input.is_regex === true)
    if (!match) return fail('query 不是合法的正则表达式')

    const { files } = await listWorkspaceFiles('.')
    const results = []

    for (const f of files) {
      // 太大 / 二进制的文件直接跳过
      const file = await readTextFile(f.path).catch(() => null)
      if (!file) continue

      const lines = file.content.split(/\r?\n/)
      for (let i = 0; i < lines.length; i++) {
        if (match(lines[i])) {
          results.push(`${f.path}:${i + 1}: ${lines[i].trim().slice(0, 200)}`)
          if (results.length >= MAX_SEARCH_RESULTS) break
        }
      }
      if (results.length >= MAX_SEARCH_RESULTS) break
    }

    return ok(
      results.join('\n') || '没有匹配的结果',
      `搜索「${query}」找到 ${results.length} 处`,
    )
  },

  async create_file(input) {
    const rel = String(input.path ?? '')
    const content = input.content
    if (typeof content !== 'string') return fail('缺少 content')
    if (content.length > MAX_WRITE_CHARS) return fail('内容太长了')

    const abs = await resolveInWorkspace(rel)
    await fs.mkdir(path.dirname(abs), { recursive: true })

    try {
      // flag 'wx'：文件已存在就报 EEXIST，而不是悄悄覆盖。
      // 比"先 exists 再 write"安全 —— 两步之间文件可能被别人创建了。
      await fs.writeFile(abs, content, { encoding: 'utf8', flag: 'wx' })
    } catch (err) {
      if (err.code === 'EEXIST') return fail(`文件已存在：${rel}。修改已有文件请用 edit_file`)
      throw err
    }

    const lines = content.split(/\r?\n/).length
    return ok(`已创建 ${toRel(abs)}`, `已创建 ${toRel(abs)}（${lines} 行）`, {
      changedPath: toRel(abs),
    })
  },

  async edit_file(input) {
    const rel = String(input.path ?? '')
    if (typeof input.new_str === 'string' && input.new_str.length > MAX_WRITE_CHARS) {
      return fail('new_str 太长了')
    }

    const { abs, content } = await readTextFile(rel)
    const result = applyEdit(content, input.old_str, input.new_str)
    if (!result.ok) return fail(result.error)

    await fs.writeFile(abs, result.content, 'utf8')
    return ok(`已修改 ${toRel(abs)}`, `已修改 ${toRel(abs)} 第 ${result.line} 行附近`, {
      changedPath: toRel(abs),
    })
  },
}

/**
 * 执行一个编码工具。
 * 和 runTool 一样：input 是模型生成的，不可信；所有路径都要过沙箱。
 */
export async function runCodeTool(name, input) {
  // 用 Object.hasOwn 而不是 executors[name]：name 是模型给的，
  // 传个 "constructor" 进来，executors[name] 会拿到 Object 构造函数
  if (!Object.hasOwn(executors, name)) return fail(`未知的工具：${name}`)

  try {
    return await executors[name](input ?? {})
  } catch (err) {
    // 沙箱 / 文件不存在这类"预期中的错误"，把原因告诉模型，它能自己调整
    if (err instanceof WorkspaceError) return fail(err.message)
    console.error(`[code-tool] ${name} 执行出错：`, err)
    return fail('工具执行出错')
  }
}
