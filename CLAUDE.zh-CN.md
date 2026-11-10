# CLAUDE.md（中文版）

> 本文件是 `CLAUDE.md` 的中文翻译，供阅读参考。Claude Code 只会自动加载 `CLAUDE.md`，修改说明时请两份一起改。

本文件为 Claude Code（claude.ai/code）在本仓库中编写代码提供指引。

## 项目

TaskFlow 是一个学习 React 的教程项目：用 React 19、TypeScript、Vite 8 和 Tailwind CSS v4 构建的单页任务管理器。项目按章节一步步搭建，所以每次改动都要小，容易看懂。除非明确要求，不要引入新库（路由、状态管理、数据请求库等）。

## 常用命令

```bash
npm run dev       # 启动带 HMR 的 Vite 开发服务器
npm run server    # 启动 Express 后端，监听 127.0.0.1:3001（读取 server/.env）
npm run build     # 先 tsc -b（类型检查），再 vite build -> dist/
npm run lint      # oxlint（配置文件：.oxlintrc.json）
npm run preview   # 预览生产构建
```

`npm run dev` 还需要后端同时运行：在第二个终端里执行 `npm run server`。Vite 会把 `/api/*` 代理到 `http://localhost:3001`，去掉 `/api` 前缀，并加上从 `server/.env` 读出的 `x-taskflow-token` 请求头。如果后端没启动，Vite 会报 `http proxy error: /tasks ... ECONNREFUSED`。两个进程都只在启动时读取令牌，所以修改 `server/.env` 后要把两个都重启。

项目没有测试运行器。`npm run build` 就是类型检查关卡：`tsc -b` 会检查 `tsconfig.app.json`（src）和 `tsconfig.node.json`（vite 配置）。

## 架构

- **所有任务数据都在 `App.tsx` 里。** `tasks` 用 `useState` 保存，初始值来自 `src/data/mockTasks.ts`。新建/更新/切换/删除的处理函数都定义在 `App` 中，作为回调传给子组件；子组件自己从不修改任务。数据不会持久化：刷新页面就恢复成模拟数据。模拟数据里的注释说明第 15 章会把它换成从后端获取。
- **只和界面有关的状态放在组件本地。** `App` 持有 `showForm`（新建任务表单的开关）。`TaskList` 持有 `editingId`，某个任务处于编辑状态时，用 `TaskForm` 替换对应的 `TaskCard`。
- **`TaskForm` 同时负责新建和编辑。** 传入 `initialValue` 就进入编辑模式。`initialValue` 只在表单首次挂载时读取一次。表单用 `useId()` 生成元素 id，因为新建表单和编辑表单可能同时出现在页面上。
- **领域类型和显示元数据在 `src/types/task.ts`。** 包括 `Task`、`TaskDraft`（去掉 `id`/`createdAt` 的 `Task`，由 `App` 在创建任务时补上），以及 `PRIORITY_META` / `STATUS_META`，它们把每个取值映射到中文标签和 Tailwind 类名。要新增优先级或状态，需同时修改联合类型和对应的 `*_META` 记录。表单的下拉框/单选项都是根据这些记录生成的。

## 约定

- 界面文字和代码注释都用简体中文，请保持。日期用 `toLocaleString('zh-CN')` 显示。
- 样式只用 Tailwind 工具类，通过 `src/index.css` 里的 `@import "tailwindcss"` 和 `@tailwindcss/vite` 插件加载。没有 `tailwind.config` 文件（Tailwind v4）。
- 组件都是默认导出的函数组件，各自有一个 `XxxProps` 接口。只导入类型时用 `import type`（`verbatimModuleSyntax` 要求）。
- TS 配置开启了 `erasableSyntaxOnly`，所以不能用 `enum`、`namespace` 和构造函数参数属性。请用字符串字面量联合类型（参见 `task.ts`）。同时开启了 `noUnusedLocals` 和 `noUnusedParameters`，有未使用的局部变量或参数时构建会失败。
- 条件渲染时，`&&` 左边要放真正的布尔值（见 `TaskStats.tsx` 里的注释）：写 `{count > 0 && ...}`，不要写 `{count && ...}`。
