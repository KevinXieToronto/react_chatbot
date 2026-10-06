import { createBrowserRouter } from 'react-router'
import RootLayout from './layouts/RootLayout'
import BoardPage from './pages/BoardPage'
import ErrorPage from './pages/ErrorPage'
import NotFoundPage from './pages/NotFoundPage'
import PageLoading from './components/PageLoading'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    // 路由级 lazy 不走 <Suspense>：导航时 React Router 先把代码下载完再切页面，
    // 下载期间界面停在当前页。只有"第一次打开就落在懒加载页面上"（比如直接访问 /stats）
    // 时才需要占位，这时渲染的是 hydrateFallbackElement。
    hydrateFallbackElement: <PageLoading />,
    // 这一层及其所有子路由抛出的错误都会渲染 ErrorPage，
    // 而不是让整个应用白屏
    errorElement: <ErrorPage />,
    children: [
      // 首页不懒加载 —— 它必然要用，拆出去反而多一次网络往返
      { index: true, element: <BoardPage /> },

      // 下面三个用路由级 lazy：只有导航过去时才下载对应的 JS
      {
        path: 'tasks/:id',
        lazy: async () => {
          const { default: Component } = await import('./pages/TaskDetailPage')
          return { Component }
        },
      },
      {
        path: 'stats',
        lazy: async () => {
          const { default: Component } = await import('./pages/StatsPage')
          return { Component }
        },
      },
      {
        path: 'settings',
        lazy: async () => {
          const { default: Component } = await import('./pages/SettingsPage')
          return { Component }
        },
      },

      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
