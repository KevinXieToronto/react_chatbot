import { DiffDetails } from '../../components/DiffView'
import { useSessionChanges } from './useSessionChanges'

interface ChangesListProps {
  /** 点文件名时：打开这个文件并切回"文件"标签 */
  onOpenFile: (path: string) => void
}

/** "变更"标签：这次会话里 Agent 改过的每一处，点开能再看一遍 diff */
export default function ChangesList({ onOpenFile }: ChangesListProps) {
  const changes = useSessionChanges()

  if (changes.length === 0) {
    return <p className="p-4 text-sm text-slate-400">这次会话还没有改过文件。</p>
  }

  return (
    <ul className="divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
      {changes.map(({ id, preview }) => (
        <li key={id} className="px-3 py-2">
          <button
            type="button"
            onClick={() => onOpenFile(preview.path)}
            className="font-mono text-xs text-blue-600 hover:underline dark:text-blue-400"
          >
            {preview.isNew ? '新建 ' : '修改 '}
            {preview.path}
          </button>
          <DiffDetails preview={preview} label="查看改动" />
        </li>
      ))}
    </ul>
  )
}
