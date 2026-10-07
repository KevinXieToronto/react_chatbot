import { memo, useMemo } from 'react'
import { useFileContent } from '../../api/fileApi'

interface FileViewerProps {
  path: string | null
}

/**
 * 只读的代码查看器：行号 + 原文。
 * 后面的章节会换成 Monaco 编辑器，这里先用最朴素的 <pre> 把事情讲清楚。
 */
export default function FileViewer({ path }: FileViewerProps) {
  const { data, isPending, error, isFetching } = useFileContent(path)

  if (!path) {
    return <p className="p-4 text-sm text-slate-400">← 在左边选一个文件查看</p>
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-1.5 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
        <span className="truncate font-mono">{path}</span>
        <span className="shrink-0">
          {isFetching ? '刷新中…' : data ? `${(data.size / 1024).toFixed(1)} KB` : ''}
        </span>
      </div>

      <div className="flex-1 overflow-auto">
        {isPending ? (
          <p className="p-4 text-sm text-slate-400">加载中…</p>
        ) : error ? (
          <p className="p-4 text-sm text-rose-500">⚠ {error.message}</p>
        ) : (
          <CodeLines content={data.content} />
        )}
      </div>
    </div>
  )
}

/**
 * 行号和代码分两列渲染。
 * 行号加 select-none：用户选中复制代码时不会把行号一起复制走。
 */
const CodeLines = memo(function CodeLines({ content }: { content: string }) {
  const lines = useMemo(() => content.split(/\r?\n/), [content])

  return (
    <pre className="min-w-max py-2 font-mono text-xs leading-5 text-slate-800 dark:text-slate-200">
      {lines.map((line, i) => (
        <div key={i} className="flex hover:bg-slate-100 dark:hover:bg-slate-800">
          <span className="w-12 shrink-0 select-none pr-3 text-right text-slate-400 dark:text-slate-500">
            {i + 1}
          </span>
          {/* 空行也要占一行高度，不然行号会错位 */}
          <span className="pr-4">{line || ' '}</span>
        </div>
      ))}
    </pre>
  )
})
