import { useState } from 'react'

interface CodeBlockProps {
  language?: string
  code: string
}

export default function CodeBlock({ language, code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      // navigator.clipboard 在非 HTTPS 的非 localhost 环境下不可用
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      console.warn('复制失败：剪贴板 API 不可用（需要 HTTPS 或 localhost）')
    }
  }

  return (
    <div className="group relative my-2 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-600">
      <div className="flex items-center justify-between bg-slate-100 px-3 py-1 text-xs dark:bg-slate-900">
        <span className="font-mono text-slate-500">{language || 'text'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="rounded px-1.5 py-0.5 text-slate-500 opacity-0 transition hover:bg-slate-200 group-hover:opacity-100 dark:hover:bg-slate-700"
        >
          {copied ? '✓ 已复制' : '复制'}
        </button>
      </div>

      {/* overflow-x-auto：长代码横向滚动，不撑破面板 */}
      <pre className="overflow-x-auto bg-slate-50 p-3 text-xs leading-relaxed dark:bg-slate-900/50">
        <code className="font-mono text-slate-700 dark:text-slate-200">{code}</code>
      </pre>
    </div>
  )
}
