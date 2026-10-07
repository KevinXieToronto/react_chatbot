import { Suspense } from 'react'
import { createBrowserRouter } from 'react-router'
import RootLayout from './layouts/RootLayout'
import BoardPage from './pages/BoardPage'
import ErrorPage from './pages/ErrorPage'
import NotFoundPage from './pages/NotFoundPage'
import PageLoading from './components/PageLoading'

export const router = createBrowserRouter([
  {
    path: '/',
    element: (
      // Suspense 包在最外层：所有懒加载的子路由共用这个 fallback
      <Suspense fallback={<PageLoading />}>
        <RootLayout />
      </Suspense>
    ),
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
        // 第 29 章：代码助手。里面有 Markdown 渲染等重依赖，同样懒加载
        path: 'code',
        lazy: async () => {
          const { default: Component } = await import('./pages/CodePage')
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
