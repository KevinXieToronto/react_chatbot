import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  /** 自定义降级 UI。可以是元素，也可以是接收 error 的函数 */
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode)
  /** 出错时的回调，用来上报监控 */
  onError?: (error: Error, info: ErrorInfo) => void
  /** 这些值变化时自动重置（比如路由变了就该重试一次） */
  resetKeys?: unknown[]
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * 错误边界。这是 React 里唯一必须用 class 的场景 ——
 * getDerivedStateFromError / componentDidCatch 没有 Hook 版本。
 *
 * ⚠️ 它只能捕获【子组件渲染期间】抛出的错误。
 *    事件处理函数、setTimeout、Promise 里的错误一律捕获不到。
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  /** 子组件抛错时调用，返回值会合并进 state，用来切换到降级 UI */
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  /** 用来做副作用：上报监控、打日志 */
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] 捕获到错误：', error, info.componentStack)
    this.props.onError?.(error, info)
    // 真实项目在这里上报：Sentry.captureException(error, { extra: info })
  }

  /** resetKeys 变化时自动清除错误，给它一次重新渲染的机会 */
  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    const { resetKeys } = this.props
    if (!this.state.error || !resetKeys) return

    const prevKeys = prevProps.resetKeys ?? []
    const changed =
      resetKeys.length !== prevKeys.length ||
      resetKeys.some((key, i) => !Object.is(key, prevKeys[i]))

    if (changed) this.reset()
  }

  reset = () => {
    this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    const { children, fallback } = this.props

    if (!error) return children

    if (typeof fallback === 'function') return fallback(error, this.reset)
    if (fallback) return fallback

    // 默认降级 UI
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-center dark:border-rose-900 dark:bg-rose-950">
        <p className="font-medium text-rose-700 dark:text-rose-300">这部分内容出错了</p>
        <p className="mt-1 text-sm text-rose-600 dark:text-rose-400">{error.message}</p>
        <button
          type="button"
          onClick={this.reset}
          className="mt-4 rounded-md bg-rose-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-rose-700"
        >
          重试
        </button>
      </div>
    )
  }
}
