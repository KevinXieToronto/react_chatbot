/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
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
