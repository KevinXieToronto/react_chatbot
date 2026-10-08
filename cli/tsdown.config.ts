import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { cli: 'src/index.tsx' },
  format: 'esm',
  platform: 'node',
  // 和 package.json 的 engines 保持一致：Ink 7 要求 Node 22+
  target: 'node22',
  outDir: 'dist',
  clean: true,
  deps: {
    // （截至 2026 年 9 月、tsdown 0.23.0 实测：`deps.*` 这组选项名较新，旧版叫法不同，升级时以 tsdown 文档为准）
    // 共享核心没有发布到 npm，必须打进产物里。
    // （它在 devDependencies 里，默认就会被打包；写明是为了防止有人把它挪进 dependencies）
    alwaysBundle: ['@taskflow/agent-core'],
    // node_modules 里的包一个都不许打进来：ink、react、zod……必须写在 dependencies 里，
    // 由 npm 在用户安装时下载。漏写了，构建直接报错，而不是悄悄打包一份
    onlyBundle: [],
  },
})
