import { useId, useState } from 'react'
import type { Priority, Status, TaskDraft } from '../types/task'
import { PRIORITY_META, STATUS_META } from '../types/task'

interface TaskFormProps {
  onSubmit: (draft: TaskDraft) => void
  onCancel: () => void
  /** 编辑模式下传入已有值作为初始值；不传就是新建模式 */
  initialValue?: TaskDraft
  /** 提交按钮文字 */
  submitText?: string
}

const EMPTY_FORM: TaskDraft = {
  title: '',
  description: '',
  priority: 'medium',
  status: 'todo',
}

const MAX_TITLE = 50

const inputClass =
  'w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100'

export default function TaskForm({
  onSubmit,
  onCancel,
  initialValue,
  submitText = '添加',
}: TaskFormProps) {
  // 新建表单和编辑表单可能同时出现在页面上，所以 id 不能写死，用 useId 给每个实例生成唯一前缀
  const uid = useId()
  // initialValue 只作为"初始值"用一次。之后用户的输入由 form 自己管。
  const [form, setForm] = useState<TaskDraft>(initialValue ?? EMPTY_FORM)

  function updateField<K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const trimmedTitle = form.title.trim()
  const canSubmit = trimmedTitle.length > 0

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!canSubmit) return
    onSubmit({ ...form, title: trimmedTitle })
    // 编辑模式提交后组件会被卸载，不需要清空；新建模式才需要
    if (!initialValue) setForm(EMPTY_FORM)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-lg border border-blue-300 bg-white p-4 shadow-sm dark:border-blue-800 dark:bg-slate-800"
    >
      <div>
        <div className="mb-1 flex items-center justify-between">
          <label
            htmlFor={`${uid}-title`}
            className="text-sm font-medium text-slate-700 dark:text-slate-200"
          >
            标题 <span className="text-rose-500">*</span>
          </label>
          <span
            className={
              form.title.length >= MAX_TITLE ? 'text-xs text-rose-500' : 'text-xs text-slate-400'
            }
          >
            {form.title.length}/{MAX_TITLE}
          </span>
        </div>
        <input
          id={`${uid}-title`}
          type="text"
          value={form.title}
          onChange={(e) => updateField('title', e.target.value.slice(0, MAX_TITLE))}
          placeholder="要做什么？"
          autoFocus
          className={inputClass}
        />
      </div>

      <div>
        <label
          htmlFor={`${uid}-desc`}
          className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200"
        >
          描述
        </label>
        <textarea
          id={`${uid}-desc`}
          value={form.description}
          onChange={(e) => updateField('description', e.target.value)}
          rows={2}
          placeholder="补充说明（可选）"
          className={`${inputClass} resize-none`}
        />
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <label
            htmlFor={`${uid}-priority`}
            className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200"
          >
            优先级
          </label>
          <select
            id={`${uid}-priority`}
            value={form.priority}
            onChange={(e) => updateField('priority', e.target.value as Priority)}
            className={inputClass}
          >
            {Object.entries(PRIORITY_META).map(([value, meta]) => (
              <option key={value} value={value}>
                {meta.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1">
          <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
            状态
          </span>
          <div className="flex h-[38px] items-center gap-4">
            {Object.entries(STATUS_META).map(([value, meta]) => (
              <label
                key={value}
                className="flex cursor-pointer items-center gap-1 text-sm dark:text-slate-200"
              >
                <input
                  type="radio"
                  name="status"
                  value={value}
                  checked={form.status === value}
                  onChange={(e) => updateField('status', e.target.value as Status)}
                  className="accent-blue-600"
                />
                {meta.label}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          取消
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {submitText}
        </button>
      </div>
    </form>
  )
}
