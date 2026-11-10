# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

TaskFlow is a tutorial project for learning React: a single-page task manager built with React 19, TypeScript, Vite 8 and Tailwind CSS v4. It is built step by step, chapter by chapter, so keep changes small and easy to follow. Don't add libraries (routers, state managers, data-fetching libraries) unless asked.

## Commands

```bash
npm run dev       # Vite dev server with HMR
npm run server    # Express backend on 127.0.0.1:3001 (reads server/.env)
npm run build     # tsc -b (type-check) then vite build -> dist/
npm run lint      # oxlint (config: .oxlintrc.json)
npm run preview   # serve the production build
```

`npm run dev` needs the backend running too: start `npm run server` in a second terminal. Vite proxies `/api/*` to `http://localhost:3001`, removes the `/api` prefix and adds the `x-taskflow-token` header from `server/.env`. If the backend isn't running, Vite logs `http proxy error: /tasks ... ECONNREFUSED`. Both processes read the token only at startup, so restart both after changing `server/.env`.

The project has no test runner. `npm run build` is the type-check gate: `tsc -b` checks `tsconfig.app.json` (src) and `tsconfig.node.json` (vite config).

## Architecture

- **All task data lives in `App.tsx`.** `tasks` is held in `useState`, seeded from `src/data/mockTasks.ts`. Create/update/toggle/delete handlers are defined in `App` and passed down as callbacks; child components never change tasks themselves. Nothing is saved: a reload resets to the mock data. The mock data comment says chapter 15 will replace it with a backend fetch.
- **UI-only state stays local.** `App` owns `showForm` (the new-task form toggle). `TaskList` owns `editingId` and renders `TaskForm` in place of a `TaskCard` while that task is being edited.
- **`TaskForm` handles both create and edit.** Passing `initialValue` switches it to edit mode. `initialValue` is read only once, when the form first mounts. The form uses `useId()` for element ids because a create form and an edit form can be on screen at the same time.
- **Domain types and display metadata are in `src/types/task.ts`.** `Task`, `TaskDraft` (`Task` without `id`/`createdAt`; `App` adds those when it creates a task), and `PRIORITY_META` / `STATUS_META`, which map each value to its Chinese label and Tailwind classes. To add a priority or status, change the union type and its `*_META` record together. The form's select/radio options are generated from these records.

## Conventions

- UI text and code comments are in Simplified Chinese; keep it that way. Dates are shown with `toLocaleString('zh-CN')`.
- Styling is Tailwind utility classes only, loaded with `@import "tailwindcss"` in `src/index.css` and the `@tailwindcss/vite` plugin. There is no `tailwind.config` file (Tailwind v4).
- Components are default-exported function components, each with its own `XxxProps` interface. Type-only imports use `import type` (required by `verbatimModuleSyntax`).
- The TS config has `erasableSyntaxOnly` on, so `enum`, `namespace` and constructor parameter properties are not allowed. Use string-literal unions (as in `task.ts`). `noUnusedLocals` and `noUnusedParameters` are also on, so the build fails on unused locals or parameters.
- For conditional rendering, use a real boolean on the left of `&&` (see the comment in `TaskStats.tsx`): `{count > 0 && ...}`, not `{count && ...}`.
