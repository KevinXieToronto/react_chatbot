import { Router } from 'express'
import { readDb, mutate, newId } from '../db.js'

export const tasksRouter = Router()

const PRIORITIES = ['low', 'medium', 'high']
const STATUSES = ['todo', 'doing', 'done']

/**
 * 从请求体里挑出【允许客户端修改】的字段，并逐个校验类型和取值。
 * 返回 { fields } 或 { error }。
 *
 * ⚠️ 为什么不直接 Object.assign(task, req.body)：
 *    请求体是客户端随便发的。不挑字段的话，别人可以顺手改掉 id、createdAt，
 *    甚至塞进任意字段（第 25 章给工具写参数校验时会再强调一次同一个原则）。
 */
function pickTaskFields(body) {
  const fields = {}
  if (body.title !== undefined) {
    if (typeof body.title !== 'string' || body.title.trim() === '') return { error: '标题不能为空' }
    fields.title = body.title.trim()
  }
  if (body.description !== undefined) {
    if (typeof body.description !== 'string') return { error: 'description 必须是字符串' }
    fields.description = body.description
  }
  if (body.priority !== undefined) {
    if (!PRIORITIES.includes(body.priority)) return { error: `priority 只能是 ${PRIORITIES.join(' / ')}` }
    fields.priority = body.priority
  }
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) return { error: `status 只能是 ${STATUSES.join(' / ')}` }
    fields.status = body.status
  }
  return { fields }
}

// 接口形状和 json-server 完全一致，所以前端一行都不用改
tasksRouter.get('/', async (req, res) => {
  const db = await readDb()
  res.json(db.tasks)
})

tasksRouter.get('/:id', async (req, res) => {
  const db = await readDb()
  const task = db.tasks.find((t) => t.id === req.params.id)
  if (!task) return res.status(404).json({ message: '任务不存在' })
  res.json(task)
})

tasksRouter.post('/', async (req, res) => {
  const { fields, error } = pickTaskFields(req.body ?? {})
  if (error) return res.status(400).json({ message: error })
  if (!fields.title) return res.status(400).json({ message: '标题不能为空' })

  const task = {
    id: newId(),
    title: fields.title,
    description: fields.description ?? '',
    priority: fields.priority ?? 'medium',
    status: fields.status ?? 'todo',
    // id 和 createdAt 由服务端生成，客户端传了也不认
    createdAt: new Date().toISOString(),
  }

  await mutate((db) => db.tasks.unshift(task))
  res.status(201).json(task)
})

tasksRouter.patch('/:id', async (req, res) => {
  const { fields, error } = pickTaskFields(req.body ?? {})
  if (error) return res.status(400).json({ message: error })

  const updated = await mutate((db) => {
    const task = db.tasks.find((t) => t.id === req.params.id)
    if (!task) return null
    // 只合并白名单里的字段
    Object.assign(task, fields)
    return task
  })

  if (!updated) return res.status(404).json({ message: '任务不存在' })
  res.json(updated)
})

tasksRouter.delete('/:id', async (req, res) => {
  const ok = await mutate((db) => {
    const i = db.tasks.findIndex((t) => t.id === req.params.id)
    if (i === -1) return false
    db.tasks.splice(i, 1)
    return true
  })

  if (!ok) return res.status(404).json({ message: '任务不存在' })
  res.status(204).end()
})
