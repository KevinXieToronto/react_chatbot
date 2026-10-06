import { Link, useRouteError, isRouteErrorResponse } from 'react-router'

export default function ErrorPage() {
  // 拿到路由渲染过程中抛出的错误
  const error = useRouteError()

  let title = '出错了'
  let detail = '发生了未知错误'

  if (isRouteErrorResponse(error)) {
    // 这是 React Router 抛的 HTTP 风格错误（比如 loader 里 throw new Response）
    title = `${error.status} ${error.statusText}`
    detail = error.data ?? detail
  } else if (error instanceof Error) {
    title = '页面崩溃了'
    detail = error.message
  }

  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 p-8 text-center dark:border-rose-900 dark:bg-rose-950">
      <h1 className="text-xl font-bold text-rose-700 dark:text-rose-300">{title}</h1>
      <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{detail}</p>
      <div className="mt-6 flex justify-center gap-2">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700"
        >
          刷新页面
        </button>
        <Link
          to="/"
          className="rounded-md border border-rose-300 px-4 py-2 text-sm text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:text-rose-300"
        >
          返回看板
        </Link>
      </div>
    </div>
  )
}
