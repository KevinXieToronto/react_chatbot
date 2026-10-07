import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { http } from '../lib/http'
import { fileKeys } from './queryKeys'

// 第 17 章的规矩：进入应用的外部数据先过 schema
const FileTreeSchema = z.object({
  files: z.array(z.object({ path: z.string(), size: z.number() })),
  truncated: z.boolean(),
})

const FileContentSchema = z.object({
  path: z.string(),
  content: z.string(),
  size: z.number(),
})

export type FileTree = z.infer<typeof FileTreeSchema>
export type FileContent = z.infer<typeof FileContentSchema>

export async function fetchFileTree(): Promise<FileTree> {
  const { data } = await http.get('/files')
  return FileTreeSchema.parse(data)
}

export async function fetchFileContent(path: string): Promise<FileContent> {
  // 用 params 让 axios 负责编码，别自己拼 `?path=${path}`（路径里可能有 & # 空格）
  const { data } = await http.get('/files/content', { params: { path } })
  return FileContentSchema.parse(data)
}

export function useFileTree() {
  return useQuery({ queryKey: fileKeys.tree(), queryFn: fetchFileTree })
}

export function useFileContent(path: string | null) {
  return useQuery({
    queryKey: fileKeys.content(path ?? ''),
    queryFn: () => fetchFileContent(path as string),
    // 没选文件时不发请求
    enabled: path !== null,
  })
}
