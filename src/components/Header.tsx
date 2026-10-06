import ThemeToggle from './ThemeToggle'

interface HeaderProps {
  taskCount: number
}

export default function Header({ taskCount }: HeaderProps) {
  return (
    <header className="border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
      <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded bg-blue-600 text-sm font-bold text-white">
            T
          </span>
          <span className="text-lg font-semibold text-slate-800 dark:text-slate-100">TaskFlow</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500 dark:text-slate-400">共 {taskCount} 个任务</span>
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
