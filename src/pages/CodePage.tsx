import CodeChat from '../features/code/CodeChat'
import FilePanel from '../features/code/FilePanel'

/**
 * 代码助手页：左边对话，右边文件。
 * 大屏左右分栏，小屏上下堆叠。
 */
export default function CodePage() {
  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-[32rem] flex-col gap-3">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">代码助手</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Agent 只能读写项目根目录下的 <code>workspace/</code>，越界的路径会被服务端拒绝。
        </p>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-2 gap-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:grid-rows-1">
        <CodeChat />
        <FilePanel />
      </div>
    </div>
  )
}
