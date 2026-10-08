// 第 36 章：diff 的 schema 和纯函数搬进了共享核心（终端版第 39 章也要画 diff）。
// 保留这个文件只为了不改动网页端的 import 路径。
export { DiffHunkSchema, DiffPreviewSchema, hunksToRows, foldContext, toSplitRows } from '@taskflow/agent-core'
export type { DiffHunk, DiffPreview, DiffLine, DiffRow, DiffSegment, SplitRow } from '@taskflow/agent-core'
