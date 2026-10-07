import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { taskKeys } from '../../api/queryKeys'
import { TaskSchema } from '../../types/schemas'
import type { Task } from '../../types/task'
import { useCopilotStore } from '../../store/copilotStore'

/**
 * 把 Agent 造成的服务端数据变更同步到前端缓存。
 *
 * 两层策略：
 * 1. 乐观：能直接写缓存的就立刻写（用户马上看到结果）
 * 2. 兜底：无论如何都 invalidate 一次，确保最终和服务端一致
 *
 * @param op  改数据的工具名：create_task / update_task / delete_task
 * @param raw 工具返回的任务对象（删除时只有 id）
 */
export function useTaskSync() {
  const queryClient = useQueryClient()
  const markChanged = useCopilotStore((s) => s.markChanged)

  return useCallback(
    (op: string, raw?: Record<string, unknown>) => {
      // ⚠️ raw 来自网络，而且间接来自模型生成的内容 —— 必须校验再用。
      //    第 17 章的规矩：任何进入应用的外部数据都要过 schema。
      const parsed = raw ? TaskSchema.safeParse(raw) : null
      const task: Task | null = parsed?.success ? (parsed.data as Task) : null

      // ── 第一层：乐观写缓存 ──────────────────────
      if (task) {
        markChanged(task.id)

        if (op === 'create_task') {
          queryClient.setQueryData<Task[]>(taskKeys.lists(), (old = []) => {
            // 防重复：invalidate 可能比乐观写慢，两边都插会出现两条
            if (old.some((t) => t.id === task.id)) return old
            return [task, ...old]
          })
        }

        if (op === 'update_task') {
          queryClient.setQueryData<Task[]>(taskKeys.lists(), (old = []) =>
            old.map((t) => (t.id === task.id ? task : t)),
          )
          queryClient.setQueryData<Task>(taskKeys.detail(task.id), task)
        }
      }

      // 删除只需要 id，不用完整对象（{ id } 过不了 TaskSchema，所以单独处理）
      if (op === 'delete_task' && typeof raw?.id === 'string') {
        const id = raw.id
        queryClient.setQueryData<Task[]>(taskKeys.lists(), (old = []) =>
          old.filter((t) => t.id !== id),
        )
      }

      // ── 第二层：兜底失效 ────────────────────────
      // 乐观写的内容可能和服务端有出入（比如服务端做了额外处理），
      // 失效一次让它重新拉，保证最终一致。
      queryClient.invalidateQueries({ queryKey: taskKeys.all })
    },
    [queryClient, markChanged],
  )
}
