import type { ReactNode } from 'react'

interface FieldProps {
  label: string
  htmlFor?: string
  required?: boolean
  /** 校验错误信息，有值就显示红色提示 */
  error?: string
  /** 右上角的附加信息，比如字数统计 */
  hint?: ReactNode
  children: ReactNode
}

export default function Field({ label, htmlFor, required, error, hint, children }: FieldProps) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label htmlFor={htmlFor} className="text-sm font-medium text-slate-700 dark:text-slate-200">
          {label}
          {required && <span className="ml-0.5 text-rose-500">*</span>}
        </label>
        {hint}
      </div>

      {children}

      {/* role="alert" 让屏幕阅读器能读出错误 */}
      {error && (
        <p role="alert" className="mt-1 text-xs text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
    </div>
  )
}
