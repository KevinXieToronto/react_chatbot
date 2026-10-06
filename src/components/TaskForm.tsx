import { useId } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { TaskDraftSchema } from '../types/schemas'
import type { TaskDraftInput } from '../types/schemas'
import { PRIORITY_META, STATUS_META } from '../types/task'
import Field from './form/Field'

interface TaskFormProps {
  onSubmit: (draft: TaskDraftInput) => void
  onCancel: () => void
  initialValue?: TaskDraftInput
  submitText?: string
}

const EMPTY_FORM: TaskDraftInput = {
  title: '',
  description: '',
  priority: 'medium',
  status: 'todo',
}

const MAX_TITLE = 50

export default function TaskForm({
  onSubmit,
  onCancel,
  initialValue,
  submitText = '添加',
}: TaskFormProps) {
  // 新建表单和编辑表单可能同时在页面上，id 用 useId 生成唯一前缀（见第 06 章）
  const uid = useId()
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<TaskDraftInput>({
    // zodResolver 把 Zod 的校验结果翻译成 RHF 的 errors
    resolver: zodResolver(TaskDraftSchema),
    defaultValues: initialValue ?? EMPTY_FORM,
    // onBlur：失焦时校验。不打扰输入，又能及时反馈
    mode: 'onBlur',
  })

  // watch 会订阅这个字段，值变化时组件重渲染。
  // 只对真正需要实时显示的字段用它 —— 这里是字数统计。
  const titleValue = watch('title')

  function submit(values: TaskDraftInput) {
    onSubmit(values)
    // 新建模式提交后清空；编辑模式组件会被卸载，不用管
    if (!initialValue) reset(EMPTY_FORM)
  }

  const inputClass =
    'w-full rounded border px-3 py-2 text-sm outline-none transition-colors dark:bg-slate-700 dark:text-slate-100'
  const normalBorder = 'border-slate-300 focus:border-blue-500 dark:border-slate-600'
  const errorBorder = 'border-rose-400 focus:border-rose-500'

  return (
    <form
      // handleSubmit 自动做了 preventDefault + 校验
      onSubmit={handleSubmit(submit)}
      noValidate
      className="space-y-3 rounded-lg border border-blue-300 bg-white p-4 shadow-sm dark:border-blue-800 dark:bg-slate-800"
    >
      <Field
        label="标题"
        htmlFor={`${uid}-title`}
        required
        error={errors.title?.message}
        hint={
          <span
            className={
              titleValue.length > MAX_TITLE
                ? 'text-xs text-rose-500'
                : 'text-xs text-slate-400'
            }
          >
            {titleValue.length}/{MAX_TITLE}
          </span>
        }
      >
        <input
          id={`${uid}-title`}
          type="text"
          placeholder="要做什么？"
          autoFocus
          // register 返回 { name, onChange, onBlur, ref }，展开进去即可
          {...register('title')}
          className={`${inputClass} ${errors.title ? errorBorder : normalBorder}`}
        />
      </Field>

      <Field label="描述" htmlFor={`${uid}-desc`} error={errors.description?.message}>
        <textarea
          id={`${uid}-desc`}
          rows={2}
          placeholder="补充说明（可选）"
          {...register('description')}
          className={`${inputClass} resize-none ${
            errors.description ? errorBorder : normalBorder
          }`}
        />
      </Field>

      <div className="flex gap-3">
        <div className="flex-1">
          <Field label="优先级" htmlFor={`${uid}-priority`} error={errors.priority?.message}>
            <select
              id={`${uid}-priority`}
              {...register('priority')}
              className={`${inputClass} ${normalBorder}`}
            >
              {Object.entries(PRIORITY_META).map(([value, meta]) => (
                <option key={value} value={value}>
                  {meta.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="flex-1">
          <Field label="状态" error={errors.status?.message}>
            <div className="flex h-[38px] items-center gap-4">
              {Object.entries(STATUS_META).map(([value, meta]) => (
                <label key={value} className="flex cursor-pointer items-center gap-1 text-sm dark:text-slate-200">
                  {/* 单选组：同一个 name 注册多次，RHF 自己处理 */}
                  <input
                    type="radio"
                    value={value}
                    {...register('status')}
                    className="accent-blue-600"
                  />
                  {meta.label}
                </label>
              ))}
            </div>
          </Field>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        {/* isDirty：用户改过内容没有。可以用来提示"有未保存的改动" */}
        {isDirty && <span className="mr-auto text-xs text-slate-400">有未保存的改动</span>}

        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          取消
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {isSubmitting ? '提交中…' : submitText}
        </button>
      </div>
    </form>
  )
}
