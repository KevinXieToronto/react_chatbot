/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { visualizer } from 'rollup-plugin-visualizer'

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
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['src/test/**', 'src/main.tsx', '**/*.d.ts'],
    },
  },
})
