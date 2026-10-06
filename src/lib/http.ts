import axios from 'axios'
import type { AxiosError } from 'axios'

/** 统一的业务错误类型，UI 层只需要认这一个 */
export class ApiError extends Error {
  /** HTTP 状态码。0 表示网络层就失败了（断网、跨域、超时） */
  readonly status: number

  constructor(message: string, status = 0) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export const http = axios.create({
  // 开发环境是 /api（走 Vite proxy），生产环境是 .env.production 里的完整地址
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
})

// ── 请求拦截器：发出去之前 ──────────────────────────
http.interceptors.request.use(
  (config) => {
    // 真实项目在这里加认证头：
    // const token = useAuthStore.getState().token
    // if (token) config.headers.Authorization = `Bearer ${token}`

    if (import.meta.env.DEV) {
      console.log(`[HTTP] ${config.method?.toUpperCase()} ${config.url}`)
    }
    return config
  },
  (error) => Promise.reject(error),
)

// ── 响应拦截器：拿到响应之后 ────────────────────────
http.interceptors.response.use(
  // 成功：原样返回 response，调用方自己按需读 .data（见下面的 API 层）
  (response) => response,

  // 失败：把 axios 五花八门的错误统一成 ApiError
  (error: AxiosError<{ message?: string }>) => {
    // 被主动取消的请求不算错误，原样抛出去让调用方识别（第 24 章会用到）
    if (axios.isCancel(error)) {
      return Promise.reject(error)
    }

    if (error.response) {
      // 服务器有响应，但状态码是 4xx / 5xx
      const status = error.response.status
      const serverMessage = error.response.data?.message

      const messageMap: Record<number, string> = {
        400: '请求参数有误',
        401: '登录已过期，请重新登录',
        403: '没有权限执行这个操作',
        404: '请求的资源不存在',
        500: '服务器出错了，请稍后再试',
      }

      throw new ApiError(serverMessage ?? messageMap[status] ?? `请求失败（${status}）`, status)
    }

    if (error.code === 'ECONNABORTED') {
      throw new ApiError('请求超时，请检查网络', 0)
    }

    // 压根没收到响应：后端没启动、断网、被防火墙拦了
    throw new ApiError('无法连接服务器，请确认后端已启动（npm run server）', 0)
  },
)
