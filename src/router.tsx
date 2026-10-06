import { createBrowserRouter } from 'react-router'
import RootLayout from './layouts/RootLayout'
import BoardPage from './pages/BoardPage'
import TaskDetailPage from './pages/TaskDetailPage'
import StatsPage from './pages/StatsPage'
import SettingsPage from './pages/SettingsPage'
import NotFoundPage from './pages/NotFoundPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      // index: true 表示父路径本身，也就是 "/"
      { index: true, element: <BoardPage /> },
      // 子路由的 path 不带开头的斜杠，实际路径是 /tasks/xxx
      { path: 'tasks/:id', element: <TaskDetailPage /> },
      { path: 'stats', element: <StatsPage /> },
      { path: 'settings', element: <SettingsPage /> },
      // 通配符放最后，匹配所有没命中的路径
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
