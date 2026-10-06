import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { taskApi } from './taskApi'
import { taskKeys } from './queryKeys'
import type { Task, TaskDraft } from '../types/task'

// ── 查询 ────────────────────────────────────────────

export function useTasks() {
  return useQuery({
    queryKey: taskKeys.lists(),
    // signal 由 TanStack Query 提供：组件卸载或查询被取消时自动 abort
    queryFn: ({ signal }) => taskApi.list(signal),
  })
}

export function useTask(id: string | undefined) {
  return useQuery({
    queryKey: taskKeys.detail(id ?? ''),
    queryFn: ({ signal }) => taskApi.get(id!, signal),
    // id 还没准备好时不发请求
    enabled: Boolean(id),
  })
}

// ── 变更 ────────────────────────────────────────────

export function useCreateTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (draft: TaskDraft) => taskApi.create(draft),
    // 注意 return：invalidateQueries 返回一个 Promise（等重新拉取完成）。
    // 把它 return 出去，mutation 才会等刷新结束再算"完成"，
    // mutateAsync 也才会在列表已经是最新时才 resolve。
    onSuccess: () => queryClient.invalidateQueries({ queryKey: taskKeys.lists() }),
  })
}

export function useUpdateTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Task> }) =>
      taskApi.update(id, patch),

    // 乐观更新三段式 ①
    onMutate: async ({ id, patch }) => {
      // 关键：先取消进行中的查询，否则它回来会覆盖我们的乐观更新
      await queryClient.cancelQueries({ queryKey: taskKeys.lists() })

      const previous = queryClient.getQueryData<Task[]>(taskKeys.lists())

      queryClient.setQueryData<Task[]>(taskKeys.lists(), (old = []) =>
        old.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      )

      // 详情页的缓存也一起改，保证两边一致
      queryClient.setQueryData<Task>(taskKeys.detail(id), (old) =>
        old ? { ...old, ...patch } : old,
      )

      return { previous }
    },

    // ② 失败回滚
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(taskKeys.lists(), context.previous)
      }
    },

    // ③ 无论成败都重新对齐服务端
    onSettled: (_data, _err, { id }) => {
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() })
      queryClient.invalidateQueries({ queryKey: taskKeys.detail(id) })
    },
  })
}

export function useDeleteTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => taskApi.remove(id),

    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.lists() })
      const previous = queryClient.getQueryData<Task[]>(taskKeys.lists())

      queryClient.setQueryData<Task[]>(taskKeys.lists(), (old = []) =>
        old.filter((t) => t.id !== id),
      )

      return { previous }
    },

    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(taskKeys.lists(), context.previous)
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() })
    },
  })
}

/** 批量操作：并发发请求，全部完成后失效一次 */
export function useBulkUpdate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ ids, patch }: { ids: string[]; patch: Partial<Task> }) => {
      await Promise.all(ids.map((id) => taskApi.update(id, patch)))
    },
    // return 出去，让 mutateAsync 等到重新拉取完成才 resolve。
    // 不 return 的话，调用方 await 完成时列表还是旧的，界面会先闪一下旧数据。
    onSuccess: () => queryClient.invalidateQueries({ queryKey: taskKeys.all }),
  })
}

export function useBulkDelete() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => taskApi.remove(id)))
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: taskKeys.all }),
  })
}
