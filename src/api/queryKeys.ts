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
