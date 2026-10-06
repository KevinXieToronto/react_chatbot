import { NavLink, Outlet } from 'react-router'
import ThemeToggle from '../components/ThemeToggle'
import { useTasks } from '../api/taskQueries'

const NAV_ITEMS = [
  { to: '/', label: '看板', end: true },
  { to: '/stats', label: '统计', end: false },
  { to: '/settings', label: '设置', end: false },
]

export default function RootLayout() {
  const { data: tasks = [] } = useTasks()
  const taskCount = tasks.length

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-900">
      <header className="border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            {/* Logo 用 Link 跳回首页 */}
            <NavLink to="/" className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded bg-blue-600 text-sm font-bold text-white">
                T
              </span>
              <span className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                TaskFlow
              </span>
            </NavLink>

            <nav className="flex gap-1">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  // end 让 "/" 只在精确匹配时才高亮，否则它在每个页面都是 active
                  end={item.end}
                  className={({ isActive }) =>
                    isActive
                      ? 'rounded-md bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                      : 'rounded-md px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700'
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-500 sm:inline dark:text-slate-400">
              共 {taskCount} 个
            </span>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* 子路由渲染在这里。切换页面时 header 不会重新挂载。 */}
      <main className="mx-auto max-w-4xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
