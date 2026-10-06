import { useState } from 'react'

/**
 * 仅供本章验证用。演示错误边界能捕获什么、不能捕获什么。
 * 真实项目里不要留这种东西。
 */
export default function CrashTest() {
  const [crashOnRender, setCrashOnRender] = useState(false)

  // ✅ 渲染期间抛错 —— 错误边界能捕获
  if (crashOnRender) {
    throw new Error('这是渲染期间抛出的测试错误')
  }

  return (
    <div className="mb-4 flex flex-wrap gap-2 rounded-lg border border-dashed border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950">
      <span className="text-amber-700 dark:text-amber-300">错误边界测试：</span>

      <button
        type="button"
        onClick={() => setCrashOnRender(true)}
        className="rounded bg-amber-600 px-2 py-0.5 text-xs text-white hover:bg-amber-700"
      >
        渲染时崩溃（能捕获）
      </button>

      <button
        type="button"
        onClick={() => {
          // ❌ 事件处理函数里抛错 —— 错误边界捕获不到，只会打到控制台
          throw new Error('这是事件处理函数里抛出的错误')
        }}
        className="rounded border border-amber-600 px-2 py-0.5 text-xs text-amber-700 hover:bg-amber-100 dark:text-amber-300"
      >
        事件里崩溃（捕获不到）
      </button>

      <button
        type="button"
        onClick={() => {
          // ❌ 异步代码里抛错 —— 同样捕获不到
          setTimeout(() => {
            throw new Error('这是 setTimeout 里抛出的错误')
          }, 100)
        }}
        className="rounded border border-amber-600 px-2 py-0.5 text-xs text-amber-700 hover:bg-amber-100 dark:text-amber-300"
      >
        异步里崩溃（捕获不到）
      </button>
    </div>
  )
}
