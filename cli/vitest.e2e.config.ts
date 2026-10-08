import { defineConfig } from 'vitest/config'

// 端到端测试单独一份配置：`npm test` 不会跑它们（默认只认 *.test.ts）
export default defineConfig({
  test: {
    include: ['e2e/**/*.e2e.ts'],
    // node-pty 是原生模块，放在子进程里跑最稳（Vitest 的默认值，这里写明）
    pool: 'forks',
    testTimeout: 60_000,
    hookTimeout: 30_000,
  },
})
