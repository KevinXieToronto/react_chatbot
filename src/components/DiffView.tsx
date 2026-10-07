import { memo, useMemo, useState } from 'react'
import { foldContext, hunksToRows, toSplitRows } from '../lib/diff'
import type { DiffLine, DiffPreview, DiffRow } from '../lib/diff'

interface DiffViewProps {
  preview: DiffPreview
  /** 最多渲染多少行（不含折叠起来的），超过就截断 */
  maxRows?: number
}

type Mode = 'unified' | 'split'

/** 行的配色：只是辅助，+/- 符号才是主要信息（色弱用户也能分清） */
const ROW_CLASS: Record<DiffLine['kind'], string> = {
  add: 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-100',
  del: 'bg-rose-50 text-rose-900 dark:bg-rose-950/60 dark:text-rose-100',
  context: 'text-slate-700 dark:text-slate-300',
}

const MARK: Record<DiffLine['kind'], string> = { add: '+', del: '-', context: ' ' }
/** 给读屏软件的文字：符号 "+" 有的读屏会读成"加"，意思不够明确 */
const SR_LABEL: Record<DiffLine['kind'], string> = { add: '新增', del: '删除', context: '' }

const numCls = 'w-10 select-none px-1 text-right align-top text-slate-400 dark:text-slate-500'
const markCls = 'w-4 select-none text-center align-top font-bold'
const codeCls = 'whitespace-pre-wrap break-all pr-3 align-top'

/**
 * Diff 展示：统一视图 / 并排视图，未改动的代码折叠成"展开 N 行"。
 *
 * memo：审批卡片里有倒计时，每秒重渲染一次；diff 本身不变，没必要跟着重算重画。
 */
const DiffView = memo(function DiffView({ preview, maxRows = 800 }: DiffViewProps) {
  const [mode, setMode] = useState<Mode>('unified')
  /** 用户展开了哪几段折叠 */
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(() => new Set())

  const segments = useMemo(() => foldContext(hunksToRows(preview.hunks)), [preview.hunks])

  const header = (
    <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-2 py-1 dark:border-slate-700 dark:bg-slate-800">
      <span className="min-w-0 truncate font-mono text-xs text-slate-600 dark:text-slate-300">
        {preview.isNew && (
          <span className="mr-1 rounded bg-emerald-100 px-1 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200">
            新文件
          </span>
        )}
        {preview.path}
      </span>
      <span className="flex shrink-0 items-center gap-2 text-xs">
        <span className="font-mono text-emerald-600 dark:text-emerald-400">+{preview.additions}</span>
        <span className="font-mono text-rose-600 dark:text-rose-400">−{preview.deletions}</span>
        {!preview.tooLarge && (
          <span className="flex overflow-hidden rounded border border-slate-300 dark:border-slate-600">
            {(['unified', 'split'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={`px-1.5 py-0.5 ${
                  mode === m
                    ? 'bg-slate-700 text-white dark:bg-slate-200 dark:text-slate-900'
                    : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700'
                }`}
              >
                {m === 'unified' ? '统一' : '并排'}
              </button>
            ))}
          </span>
        )}
      </span>
    </div>
  )

  // 服务端判定太大：只给统计，不渲染
  if (preview.tooLarge) {
    return (
      <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
        {header}
        <p className="p-3 text-xs text-slate-500 dark:text-slate-400">
          diff 太大（+{preview.additions} −{preview.deletions}），不在这里逐行显示。
          批准之前，最好让 Agent 把改动拆小，或者自己去编辑器里看。
        </p>
      </div>
    )
  }

  // 按"渲染预算"逐段输出，超出 maxRows 就停
  let budget = maxRows
  let truncated = 0
  const body: React.ReactNode[] = []

  for (const [index, seg] of segments.entries()) {
    if (seg.type === 'fold' && !expanded.has(seg.id)) {
      body.push(
        <FoldRow
          key={`fold-${seg.id}`}
          count={seg.rows.length}
          colSpan={mode === 'unified' ? 4 : 6}
          onExpand={() => setExpanded((prev) => new Set(prev).add(seg.id))}
        />,
      )
      continue
    }

    const rows: DiffRow[] = seg.rows
    const visible = budget > 0 ? rows.slice(0, budget) : []
    truncated += rows.length - visible.length
    budget -= visible.length
    if (visible.length === 0) continue

    body.push(
      mode === 'unified' ? (
        <UnifiedRows key={`seg-${index}`} rows={visible} />
      ) : (
        <SplitRows key={`seg-${index}`} rows={visible} />
      ),
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
      {header}
      <div className="max-h-80 overflow-auto bg-white dark:bg-slate-900">
        <table className="w-full border-collapse font-mono text-xs leading-5">
          <caption className="sr-only">
            {preview.path} 的改动：新增 {preview.additions} 行，删除 {preview.deletions} 行
          </caption>
          <tbody>{body}</tbody>
        </table>
        {truncated > 0 && (
          <p className="border-t border-slate-200 p-2 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
            diff 太大，还有 {truncated} 行没有显示。
          </p>
        )}
      </div>
    </div>
  )
})

export default DiffView

function FoldRow({ count, colSpan, onExpand }: { count: number; colSpan: number; onExpand: () => void }) {
  return (
    <tr className="bg-slate-50 dark:bg-slate-800/60">
      <td colSpan={colSpan} className="px-2 py-0.5">
        <button
          type="button"
          onClick={onExpand}
          className="text-xs text-blue-600 hover:underline dark:text-blue-400"
        >
          ↕ 展开 {count} 行未改动的代码
        </button>
      </td>
    </tr>
  )
}

function GapRow({ colSpan }: { colSpan: number }) {
  return (
    <tr className="bg-slate-50 dark:bg-slate-800/60">
      <td colSpan={colSpan} className="px-2 py-0.5 text-center text-slate-400">
        ⋯
      </td>
    </tr>
  )
}

function UnifiedRows({ rows }: { rows: DiffRow[] }) {
  return (
    <>
      {rows.map((row, i) =>
        row.kind === 'gap' ? (
          <GapRow key={`gap-${i}`} colSpan={4} />
        ) : (
          <tr key={`${row.oldNo}-${row.newNo}-${i}`} className={ROW_CLASS[row.kind]}>
            <td className={numCls}>{row.oldNo ?? ''}</td>
            <td className={numCls}>{row.newNo ?? ''}</td>
            <td className={markCls}>
              {MARK[row.kind]}
              {SR_LABEL[row.kind] && <span className="sr-only">{SR_LABEL[row.kind]}</span>}
            </td>
            <td className={codeCls}>{row.text || ' '}</td>
          </tr>
        ),
      )}
    </>
  )
}

function SplitRows({ rows }: { rows: DiffRow[] }) {
  const pairs = toSplitRows(rows)

  return (
    <>
      {pairs.map((pair, i) =>
        pair.gap ? (
          <GapRow key={`gap-${i}`} colSpan={6} />
        ) : (
          <tr key={i}>
            <HalfRow line={pair.left} side="old" />
            <HalfRow line={pair.right} side="new" />
          </tr>
        ),
      )}
    </>
  )
}

function HalfRow({ line, side }: { line: DiffLine | null; side: 'old' | 'new' }) {
  if (!line) {
    // 这一边没有对应的行：灰色占位
    return <td colSpan={3} className="border-l border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/40" />
  }
  const cls = ROW_CLASS[line.kind]
  return (
    <>
      <td className={`${numCls} ${cls} ${side === 'new' ? 'border-l border-slate-200 dark:border-slate-700' : ''}`}>
        {side === 'old' ? line.oldNo : line.newNo}
      </td>
      <td className={`${markCls} ${cls}`}>
        {MARK[line.kind]}
        {SR_LABEL[line.kind] && <span className="sr-only">{SR_LABEL[line.kind]}</span>}
      </td>
      <td className={`${codeCls} ${cls} w-1/2`}>{line.text || ' '}</td>
    </>
  )
}

/**
 * 默认收起的 diff，点开才看。收起时【不渲染】DiffView：
 * <details> 关着的时候子元素只是看不见，React 照样会把它们全渲染出来 ——
 * 一段对话里改了几十次文件，就是几十个 diff 表格白白挂在 DOM 上。
 */
export function DiffDetails({ preview, label }: { preview: DiffPreview; label: string }) {
  const [open, setOpen] = useState(false)

  return (
    <details className="mt-1" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer select-none text-xs text-slate-500 dark:text-slate-400">
        {label}{' '}
        <span className="font-mono text-emerald-600 dark:text-emerald-400">+{preview.additions}</span>{' '}
        <span className="font-mono text-rose-600 dark:text-rose-400">−{preview.deletions}</span>
      </summary>
      {open && (
        <div className="mt-1">
          <DiffView preview={preview} />
        </div>
      )}
    </details>
  )
}
