import { QueryClient } from '@tanstack/react-query'
import { ApiError } from './http'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 数据在这段时间内被认为是"新鲜的"，期间不会重新请求。
      // 默认是 0（拿到就立刻过期），几乎总要调大。
      staleTime: 30_000,

      // 没有组件在用这份数据后，缓存保留多久才被垃圾回收。默认 5 分钟。
      // 它和 staleTime 之间没有硬性约束，但通常不要比 staleTime 短：
      // 缓存都被回收了，"先显示旧数据、后台再刷新"的体验就没有了。
      gcTime: 5 * 60_000,

      // 失败自动重试。4xx 是客户端错误，重试多少次都没用，直接放弃。
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
          return false
        }
        return failureCount < 2
      },

      // 重试间隔指数退避：1s、2s、4s…… 最多 30s
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),

      // 窗口重新获得焦点时自动刷新。
      // 默认 true，体验很好（切回标签页自动拿最新数据），但开发时会觉得吵。
      refetchOnWindowFocus: true,

      // 断网恢复后自动刷新
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 0, // 写操作默认不重试，避免重复提交
    },
  },
})
