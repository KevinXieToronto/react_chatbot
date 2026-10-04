import type { ReactNode } from 'react'

// 一个纯布局组件：限制最大宽度、居中、加内边距。
// 它不关心里面装的是什么，全部通过 children 传进来。
export default function PageContainer({ children }: { children: ReactNode }) {
  return <main className="mx-auto max-w-4xl px-4 py-6">{children}</main>
}
