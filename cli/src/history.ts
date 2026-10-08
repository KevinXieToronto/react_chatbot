import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { useCallback, useRef } from 'react'

/** 最多记多少条 */
const MAX_ENTRIES = 200

/**
 * 历史文件放在用户主目录下：Windows 上是 C:\Users\你的用户名\.taskflow\history.json。
 * 可以用环境变量 TASKFLOW_HOME 换个目录（测试时就靠它，免得弄脏你真正的历史）。
 */
export function defaultHistoryFile(): string {
  const dir = process.env.TASKFLOW_HOME ?? path.join(os.homedir(), '.taskflow')
  return path.join(dir, 'history.json')
}

/** 读历史。文件不存在、内容坏了，都当成"没有历史"，绝不因为这个让程序起不来 */
export function loadHistory(file: string): string[] {
  try {
    const data: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
    return Array.isArray(data) ? data.filter((x): x is string => typeof x === 'string').slice(-MAX_ENTRIES) : []
  } catch {
    return []
  }
}

export function saveHistory(file: string, entries: string[]): void {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(entries, null, 2))
  } catch {
    /* 写不进去（只读目录、磁盘满）就算了，历史不是关键功能 */
  }
}

/** 追加一条：和上一条一样就不重复记；超过上限丢掉最旧的 */
export function addEntry(entries: string[], text: string): string[] {
  if (!text.trim() || entries[entries.length - 1] === text) return entries
  return [...entries, text].slice(-MAX_ENTRIES)
}

/**
 * 像 shell 一样用 ↑ / ↓ 翻历史。
 * 开始往上翻时先把正在输入的内容存成"草稿"，一路翻回最下面时还给你。
 */
export function useHistory(file: string = defaultHistoryFile()) {
  // 这三样都不需要触发重新渲染：翻历史的结果通过返回值交给输入框
  const entriesRef = useRef<string[] | null>(null)
  const indexRef = useRef<number | null>(null)
  const draftRef = useRef('')

  const entries = useCallback(() => {
    // 第一次用到时才读文件（懒加载），不拖慢启动
    if (entriesRef.current === null) entriesRef.current = loadHistory(file)
    return entriesRef.current
  }, [file])

  /** 上一条。没有更早的了返回 null */
  const prev = useCallback(
    (current: string): string | null => {
      const list = entries()
      if (list.length === 0) return null
      if (indexRef.current === null) {
        draftRef.current = current
        indexRef.current = list.length
      }
      if (indexRef.current === 0) return null
      indexRef.current -= 1
      return list[indexRef.current]
    },
    [entries],
  )

  /** 下一条。翻过最新的一条，还回草稿；本来就没在翻，返回 null */
  const next = useCallback((): string | null => {
    if (indexRef.current === null) return null
    const list = entries()
    indexRef.current += 1
    if (indexRef.current >= list.length) {
      indexRef.current = null
      return draftRef.current
    }
    return list[indexRef.current]
  }, [entries])

  /** 发送了一条：记下来、存盘，并结束"翻历史"的状态 */
  const push = useCallback(
    (text: string) => {
      const updated = addEntry(entries(), text)
      entriesRef.current = updated
      indexRef.current = null
      saveHistory(file, updated)
    },
    [entries, file],
  )

  /** 不翻了（比如用户按 Esc 清空了输入） */
  const reset = useCallback(() => {
    indexRef.current = null
  }, [])

  return { prev, next, push, reset }
}
