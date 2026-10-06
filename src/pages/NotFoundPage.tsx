import { Link } from 'react-router'

export default function NotFoundPage() {
  return (
    <div className="py-20 text-center">
      <p className="text-6xl font-bold text-slate-300 dark:text-slate-600">404</p>
      <p className="mt-3 text-slate-600 dark:text-slate-300">这个页面不存在</p>
      <Link
        to="/"
        className="mt-6 inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        返回看板
      </Link>
    </div>
  )
}
