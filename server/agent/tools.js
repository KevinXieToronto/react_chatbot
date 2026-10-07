import { readDb, mutate, newId } from '../db.js'

const PRIORITIES = ['low', 'medium', 'high']
const STATUSES = ['todo', 'doing', 'done']

/**
 * 给模型看的工具定义。
 *
 * 写好 description 比写好代码更重要 —— 模型是靠它决定什么时候调用、
 * 怎么填参数的。description 含糊，模型就会乱调或不调。
 */
export const toolDefinitions = [
  {
    name: 'list_tasks',
    description:
      '查询用户的任务列表。可以按状态和优先级筛选。' +
      '任何需要知道"用户有哪些任务""某个任务是否存在"的时候，都必须先调用这个工具，不要凭空编造。',
    input_schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: [...STATUSES, 'all'],
          description: '按状态筛选。todo=待办，doing=进行中，done=已完成，all=全部。默认 all',
        },
        priority: {
          type: 'string',
          enum: [...PRIORITIES, 'all'],
          description: '按优先级筛选。默认 all',
        },
        keyword: {
          type: 'string',
          description: '按标题/描述做关键词模糊匹配',
        },
      },
    },
  },
  {
    name: 'create_task',
    description:
      '创建一个新任务。只有在用户明确表达了要新建任务、且提供了标题时才调用。' +
      '如果用户只说"帮我加个任务"但没说内容，先问清楚，不要自己编标题。',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '任务标题，必填，2~50 个字' },
        description: { type: 'string', description: '补充说明，可选' },
        priority: { type: 'string', enum: PRIORITIES, description: '优先级，默认 medium' },
        status: { type: 'string', enum: STATUSES, description: '初始状态，默认 todo' },
      },
      required: ['title'],
    },
  },
  {
    name: 'update_task',
    description:
      '更新一个已有任务。必须先用 list_tasks 拿到正确的任务 id，不要猜测 id。' +
      '标记任务完成就是把 status 改成 done。',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '任务 id，来自 list_tasks 的返回结果' },
        title: { type: 'string' },
        description: { type: 'string' },
        priority: { type: 'string', enum: PRIORITIES },
        status: { type: 'string', enum: STATUSES },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_task',
    description:
      '删除一个任务。这是不可逆操作 —— 调用之前必须已经向用户确认过，' +
      '如果用户没有明确说要删除某条，先问清楚再调用。',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '任务 id，来自 list_tasks 的返回结果' },
      },
      required: ['id'],
    },
  },
]

/** 工具执行的统一返回格式 */
function ok(data, summary) {
  return { ok: true, data, summary }
}
function fail(message) {
  return { ok: false, error: message, summary: `失败：${message}` }
}

/**
 * 真正执行工具。
 *
 * ⚠️ input 是【模型生成的】，属于不可信输入。
 *    每个字段都要校验，就像对待用户表单提交一样。
 */
const executors = {
  async list_tasks(input) {
    const db = await readDb()
    const { status = 'all', priority = 'all', keyword = '' } = input ?? {}

    let tasks = db.tasks

    if (status !== 'all' && STATUSES.includes(status)) {
      tasks = tasks.filter((t) => t.status === status)
    }
    if (priority !== 'all' && PRIORITIES.includes(priority)) {
      tasks = tasks.filter((t) => t.priority === priority)
    }
    if (typeof keyword === 'string' && keyword.trim()) {
      const kw = keyword.trim().toLowerCase()
      tasks = tasks.filter(
        (t) =>
          t.title.toLowerCase().includes(kw) || t.description.toLowerCase().includes(kw),
      )
    }

    // 只把模型需要的字段返回，别把整个数据库结构喂给它 —— 省 token 也更安全
    const slim = tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
    }))

    return ok(slim, `找到 ${slim.length} 条任务`)
  },

  async create_task(input) {
    const title = String(input?.title ?? '').trim()

    // 服务端校验：不能信模型传的东西
    if (title.length < 2) return fail('标题至少 2 个字')
    if (title.length > 50) return fail('标题最多 50 个字')

    const priority = PRIORITIES.includes(input?.priority) ? input.priority : 'medium'
    const status = STATUSES.includes(input?.status) ? input.status : 'todo'

    const task = {
      id: newId(),
      title,
      description: String(input?.description ?? '').slice(0, 500),
      priority,
      status,
      createdAt: new Date().toISOString(),
    }

    await mutate((db) => db.tasks.unshift(task))
    return ok({ id: task.id, title: task.title }, `已创建「${task.title}」`)
  },

  async update_task(input) {
    const id = String(input?.id ?? '')
    if (!id) return fail('缺少任务 id')

    // 白名单：只允许改这四个字段。
    // 不做白名单的话，模型可以改 id、createdAt，甚至注入任意字段。
    const patch = {}
    if (typeof input.title === 'string' && input.title.trim()) {
      patch.title = input.title.trim().slice(0, 50)
    }
    if (typeof input.description === 'string') {
      patch.description = input.description.slice(0, 500)
    }
    if (PRIORITIES.includes(input.priority)) patch.priority = input.priority
    if (STATUSES.includes(input.status)) patch.status = input.status

    if (Object.keys(patch).length === 0) return fail('没有要更新的字段')

    const updated = await mutate((db) => {
      const task = db.tasks.find((t) => t.id === id)
      if (!task) return null
      Object.assign(task, patch)
      return task
    })

    if (!updated) return fail(`找不到 id 为 ${id} 的任务`)

    const what = Object.keys(patch).join('、')
    return ok({ id: updated.id, title: updated.title }, `已更新「${updated.title}」的 ${what}`)
  },

  async delete_task(input) {
    const id = String(input?.id ?? '')
    if (!id) return fail('缺少任务 id')

    let title = ''
    const removed = await mutate((db) => {
      const i = db.tasks.findIndex((t) => t.id === id)
      if (i === -1) return false
      title = db.tasks[i].title
      db.tasks.splice(i, 1)
      return true
    })

    if (!removed) return fail(`找不到 id 为 ${id} 的任务`)
    return ok({ id }, `已删除「${title}」`)
  },
}

export async function runTool(name, input) {
  const fn = executors[name]
  if (!fn) return fail(`未知的工具：${name}`)

  try {
    return await fn(input ?? {})
  } catch (err) {
    console.error(`[tool] ${name} 执行出错：`, err)
    return fail('工具执行出错')
  }
}

/**
 * OpenAI 版的工具定义。
 * 上面的 toolDefinitions 是教程（Claude）的格式：{ name, description, input_schema }。
 * OpenAI 要包一层：{ type: 'function', function: { name, description, parameters } }，
 * JSON Schema 本身完全一样，所以这里直接转换，不用把每个工具再写一遍。
 */
export const openaiTools = toolDefinitions.map((t) => ({
  type: 'function',
  function: { name: t.name, description: t.description, parameters: t.input_schema },
}))
