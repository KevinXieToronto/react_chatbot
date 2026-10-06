import { z } from 'zod'

// ── 基础枚举 ────────────────────────────────────────
export const PrioritySchema = z.enum(['low', 'medium', 'high'])
export const StatusSchema = z.enum(['todo', 'doing', 'done'])

// ── 表单用的 schema ─────────────────────────────────
export const TaskDraftSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, '标题至少 2 个字')
    .max(50, '标题最多 50 个字'),
  description: z.string().max(500, '描述最多 500 个字'),
  priority: PrioritySchema,
  status: StatusSchema,
})

// ── 后端数据用的 schema ─────────────────────────────
export const TaskSchema = TaskDraftSchema.extend({
  id: z.string().min(1),
  createdAt: z.string(),
}).extend({
  // 后端的 title 可能是历史数据，不受表单的 min(2) 约束，放宽一点
  title: z.string(),
  description: z.string().default(''),
})

export const TaskListSchema = z.array(TaskSchema)

// ── 从 schema 推导类型 ──────────────────────────────
// 这是关键：schema 是唯一真相，类型自动跟着走
export type TaskDraftInput = z.infer<typeof TaskDraftSchema>
export type TaskParsed = z.infer<typeof TaskSchema>
