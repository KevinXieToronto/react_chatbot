import { sse, sleep } from './stream.js'

/**
 * 创建一个"带事件的工具执行器"：
 *   发 tool_start → 真正执行 → 发 tool_end →（数据变了的话）发 invalidate
 *
 * 真实 Agent 循环和 Mock Agent 都通过它执行工具，
 * 所以不管是不是 Mock，前端收到的事件序列都一模一样。
 *
 * @param {import('express').Response} res
 * @param {object} profile  当前模式的配置（见 profiles.js）
 * @param {AbortSignal} signal
 * @param {{ delayMs?: number }} options  Mock 模式故意停一下，让你看得清 ⏳ 状态
 */
export function createToolRunner(res, profile, signal, { delayMs = 0 } = {}) {
  return async function callTool(id, name, input) {
    // 用户已经点了停止，就别再动任何文件了
    if (signal.aborted) throw new DOMException('已中止', 'AbortError')

    sse(res, 'tool_start', { id, name, input })
    if (delayMs) await sleep(delayMs)
    if (signal.aborted) throw new DOMException('已中止', 'AbortError')

    const result = await profile.runTool(name, input)

    sse(res, 'tool_end', { id, ok: result.ok, summary: result.summary })

    // 工具改了数据，通知前端刷新对应的缓存（第 26 章的 invalidate 思路）
    const invalidation = result.ok ? profile.invalidation(name, result) : null
    if (invalidation) sse(res, 'invalidate', invalidation)

    return result
  }
}
