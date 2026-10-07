/**
 * 把所有 queryKey 集中定义，避免在各处手写字符串导致拼错、不一致。
 * as const 让 TS 推断出精确的字面量类型。
 */
export const taskKeys = {
  /** 所有和任务相关的查询：invalidate 它会连带失效下面所有的 */
  all: ['tasks'] as const,
  /** 任务列表 */
  lists: () => [...taskKeys.all, 'list'] as const,
  /** 单条任务 */
  detail: (id: string) => [...taskKeys.all, 'detail', id] as const,
}

/** 代码助手工作区里的文件（第 29 章） */
export const fileKeys = {
  all: ['files'] as const,
  /** 文件列表 */
  tree: () => [...fileKeys.all, 'tree'] as const,
  /** 单个文件的内容 */
  content: (path: string) => [...fileKeys.all, 'content', path] as const,
}
