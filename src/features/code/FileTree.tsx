import { useMemo, useState } from 'react'
import { useFileTree } from '../../api/fileApi'
import { useCodeStore } from '../../store/codeStore'
import { buildTree, flattenTree } from './treeUtils'

export default function FileTree() {
  const { data, isPending, error } = useFileTree()
  const selectedPath = useCodeStore((s) => s.selectedPath)
  const selectFile = useCodeStore((s) => s.selectFile)
  const changedPaths = useCodeStore((s) => s.changedPaths)

  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())

  const rows = useMemo(
    () => (data ? flattenTree(buildTree(data.files), collapsed) : []),
    [data, collapsed],
  )

  function toggle(path: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  if (isPending) return <p className="p-3 text-xs text-slate-400">加载文件列表…</p>
  if (error) return <p className="p-3 text-xs text-rose-500">⚠ {error.message}</p>
  if (rows.length === 0) return <p className="p-3 text-xs text-slate-400">工作区是空的</p>

  return (
    <ul className="py-1 text-sm">
      {rows.map(({ node, depth }) => {
        const isDir = node.type === 'dir'
        const active = node.path === selectedPath
        const changed = !isDir && changedPaths.includes(node.path)

        return (
          <li key={node.path}>
            <button
              type="button"
              onClick={() => (isDir ? toggle(node.path) : selectFile(node.path))}
              style={{ paddingLeft: 8 + depth * 14 }}
              className={`flex w-full items-center gap-1.5 truncate py-1 pr-2 text-left ${
                active
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              <span className="w-3 shrink-0 text-center text-xs text-slate-400">
                {isDir ? (collapsed.has(node.path) ? '▸' : '▾') : ''}
              </span>
              <span className="truncate">{node.name}</span>
              {/* 被 Agent 改过的文件标个点 */}
              {changed && (
                <span className="ml-auto text-xs text-amber-500" title="Agent 刚改过">
                  ●
                </span>
              )}
            </button>
          </li>
        )
      })}
      {data?.truncated && <li className="px-3 py-1 text-xs text-slate-400">…文件太多，只显示一部分</li>}
    </ul>
  )
}
