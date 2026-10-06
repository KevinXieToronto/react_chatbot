import type { ReactElement, ReactNode } from 'react'
import { render } from '@testing-library/react'
import type { RenderOptions } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'

/**
 * 测试专用的 QueryClient：
 * - retry: false —— 不然一个失败用例要等好几秒重试
 * - staleTime: 0 / gcTime: 0 —— 每个用例都从干净状态开始
 */
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

interface Options extends Omit<RenderOptions, 'wrapper'> {
  /** 初始路由，测详情页之类的场景用 */
  route?: string
  queryClient?: QueryClient
}

/**
 * 带上所有 Provider 的 render。
 * MemoryRouter 而不是 BrowserRouter —— 测试环境没有真实的 history。
 */
export function renderWithProviders(
  ui: ReactElement,
  { route = '/', queryClient = createTestQueryClient(), ...options }: Options = {},
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
      </QueryClientProvider>
    )
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...options }),
    queryClient,
  }
}

// 把 RTL 的其他导出也透传出去，测试文件只需要 import 这一个模块
export * from '@testing-library/react'
export { default as userEvent } from '@testing-library/user-event'
