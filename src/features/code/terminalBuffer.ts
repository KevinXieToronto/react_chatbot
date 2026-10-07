/**
 * 命令输出的"仓库"：一个放在 React 之外的普通模块（第 32 章）。
 *
 * 为什么不放进 zustand / useState？
 * - 输出一秒能来几十块。放进 React 状态，每一块都会触发一次重渲染，
 *   而真正需要这些文字的只有 xterm —— 它自己会画，不需要 React 帮忙。
 * - 所以这里只做两件事：把输出存下来（切换命令、重新打开终端标签时要重放），
 *   以及通知订阅者"来新输出了"。xterm 组件订阅后直接 term.write()。
 */

export interface TerminalChunk {
  stream: 'stdout' | 'stderr'
  text: string
}

type Listener = (chunk: TerminalChunk) => void

interface Entry {
  chunks: TerminalChunk[]
  size: number
  /** 超过上限、开头被丢掉过 */
  truncated: boolean
}

/** 每条命令最多留多少字符用于重放（实时显示不受影响） */
const MAX_CHARS_PER_COMMAND = 256 * 1024
/** 最多记住多少条命令的输出 */
const MAX_COMMANDS = 20

const outputs = new Map<string, Entry>()
const listeners = new Map<string, Set<Listener>>()

export function hasOutput(toolUseId: string): boolean {
  return outputs.has(toolUseId)
}

/** 收到一块新输出：存下来，并立刻通知正在看这条命令的终端 */
export function appendOutput(toolUseId: string, stream: TerminalChunk['stream'], text: string) {
  let entry = outputs.get(toolUseId)
  if (!entry) {
    entry = { chunks: [], size: 0, truncated: false }
    outputs.set(toolUseId, entry)
    // Map 按插入顺序遍历，第一个就是最老的
    if (outputs.size > MAX_COMMANDS) {
      const oldest = outputs.keys().next().value
      if (oldest !== undefined) outputs.delete(oldest)
    }
  }

  const chunk = { stream, text }
  entry.chunks.push(chunk)
  entry.size += text.length
  while (entry.size > MAX_CHARS_PER_COMMAND && entry.chunks.length > 1) {
    entry.size -= entry.chunks.shift()!.text.length
    entry.truncated = true
  }

  listeners.get(toolUseId)?.forEach((fn) => fn(chunk))
}

/** 这条命令到目前为止的输出（重放用） */
export function readOutput(toolUseId: string): TerminalChunk[] {
  const entry = outputs.get(toolUseId)
  if (!entry) return []
  return entry.truncated
    ? [{ stream: 'stdout', text: '\x1b[2m…（前面的输出太长，已省略）\x1b[22m\n' }, ...entry.chunks]
    : entry.chunks
}

/** 订阅一条命令的新输出，返回取消订阅的函数 —— 正好可以直接当 useEffect 的清理函数 */
export function subscribeOutput(toolUseId: string, fn: Listener): () => void {
  let set = listeners.get(toolUseId)
  if (!set) {
    set = new Set()
    listeners.set(toolUseId, set)
  }
  set.add(fn)
  return () => {
    set.delete(fn)
    if (set.size === 0) listeners.delete(toolUseId)
  }
}

export function clearOutputs() {
  outputs.clear()
}
