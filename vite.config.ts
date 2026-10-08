import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { visualizer } from 'rollup-plugin-visualizer'

/**
 * 读 server/.env 里的 TASKFLOW_TOKEN（第 30 章），代理转发 /api 时加到请求头上。
 *
 * - 用 node:util 的 parseEnv 自己解析、只取这一个值：不写进 process.env，
 *   也不经过 Vite 的 import.meta.env —— 它只活在 vite.config 这个 Node 进程里，
 *   永远不会被打进前端包，浏览器里的代码拿不到它。
 * - 文件不存在时返回空字符串：npm run build、npm test 用不着它。
 *   这时代理照样转发，后端回 401，提醒你去配令牌。
 * - 只在启动时读一次：改了 server/.env 里的令牌，要重启 npm run dev。
 */
function readServerToken(): string {
  try {
    const text = readFileSync(new URL('./server/.env', import.meta.url), 'utf8')
    const env = parseEnv(text)
    return env.TASKFLOW_TOKEN?.trim() ?? ''
  } catch {
    return ''
  }
}

const serverToken = readServerToken()

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // 只在分析时启用：cmd 里先 set ANALYZE=1，再 npm run build（分两行执行）
    ...(process.env.ANALYZE
      ? [visualizer({ open: true, gzipSize: true, filename: 'dist/stats.html' })]
      : []),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        // 每个转发出去的请求都带上令牌。页面里的代码完全不知道它的存在
        headers: { 'x-taskflow-token': serverToken },
      },
    },
  },
  build: {
    // Vite 8 的打包器是 Rolldown，对应的配置项叫 rolldownOptions
    // （旧名字 rollupOptions 还能用，但已经标记为废弃）
    rolldownOptions: {
      output: {
        // 把不常变的第三方库单独打包，这样业务代码更新时它们的缓存还有效。
        //
        // ⚠️ 用【函数形式】而不是对象形式。很多教程写的是：
        //      manualChunks: { 'vendor-react': ['react', 'react-dom'] }
        //    Rolldown 的 manualChunks 类型只保留了函数签名，对象形式会报
        //    TS2769: No overload matches this call。函数形式既能通过类型检查，
        //    也更灵活（能按路径模式匹配）。
        //
        // 📝 Rolldown 把 manualChunks 标记为"将被取代"，推荐的新写法是
        //    output.codeSplitting.groups（每组写 name 和 test）。manualChunks 在
        //    Vite 8 里仍然可用，本章先用它，因为网上的资料和报错信息大多还是这个名字。
        manualChunks(id) {
          // 只处理第三方依赖，业务代码交给 Vite 按路由自动分割
          if (!id.includes('node_modules')) return

          // 用路径边界精确匹配，避免 'react' 误伤 'react-hook-form' 之类
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/.test(id)) {
            return 'vendor-react'
          }
          if (id.includes('@tanstack')) return 'vendor-query'
          if (id.includes('react-hook-form') || id.includes('@hookform') || id.includes('zod')) {
            return 'vendor-form'
          }
          // 其余的不指定，让 Rolldown 自己决定
        },
      },
    },
    // 单个 chunk 超过这个大小（KB）时警告
    chunkSizeWarningLimit: 600,
    // 生产环境不生成 sourcemap（会暴露源码，且体积大）
    // 想在生产排查错误的话用 'hidden' —— 生成但不在 JS 里引用，
    // 上传给 Sentry 之类的服务用
    sourcemap: false,
  },
  test: {
    // 用 jsdom 模拟浏览器环境（document、window 等）
    environment: 'jsdom',
    // 不用在每个测试文件里 import { describe, it, expect }
    globals: true,
    // 每个测试文件跑之前先执行这个
    setupFiles: ['./src/test/setup.ts'],
    css: false, // 测试不需要处理 CSS，能快不少
    // workspace/ 是给代码助手练手的独立小项目，它的测试用 node --test 跑（第 29 章）；
    // cli/ 是独立的 Node 包，有自己的 vitest（第 35 章），放进 jsdom 里跑会失败。
    // 两者都不能被这里的 Vitest 收集进来。
    exclude: [...configDefaults.exclude, 'workspace/**', 'cli/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['src/test/**', 'src/main.tsx', '**/*.d.ts'],
    },
  },
})
