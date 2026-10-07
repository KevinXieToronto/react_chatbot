import { sse, sleep } from './stream.js'
import { needsApproval, approvalReason } from './permissions.js'
import { requestApproval } from './approvals.js'

/** 用户拒绝（或超时）时返回给模型的结果 */
function deniedResult(decision) {
  const byTimeout = decision.by === 'timeout'
  const why = byTimeout ? '用户没有在规定时间内确认，已自动拒绝' : '用户拒绝了这次操作'
  const note = decision.note ? `，用户的备注：「${decision.note}」` : ''
  return {
    ok: false,
    denied: true,
    by: decision.by,
    note: decision.note ?? '',
    // 这段话是写给模型看的：告诉它发生了什么，以及接下来别做什么
    error: `${why}${note}。不要用同样的参数重试；如果不确定用户想要什么，直接问用户。`,
    summary: byTimeout ? '审批超时，已自动拒绝' : `已拒绝${decision.note ? `：${decision.note}` : ''}`,
  }
}

/**
 * 创建一个"带事件的工具执行器"：
 *   发 tool_start →（需要的话）等用户审批 → 真正执行 → 发 tool_end →（数据变了）发 invalidate
 *
 * 真实 Agent 循环和 Mock Agent 都通过它执行工具，
 * 所以审批这道关只需要写在这一个地方，谁也绕不过去。
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

    // ── 人在回路：需要批准的工具，停在这里等用户 ──────────────
    if (needsApproval(name)) {
      // 用户停止 / 断开时这里会 reject(AbortError)，一路抛到路由里
      const decision = await requestApproval(
        { toolUseId: id, name, input, reason: approvalReason(name, input) },
        { emit: (event, data) => sse(res, event, data), signal },
      )

      if (decision.decision !== 'allow') {
        const result = deniedResult(decision)
        sse(res, 'tool_end', { id, ok: false, summary: result.summary })
        return result
      }
    }

    const result = await profile.runTool(name, input, { signal })

    sse(res, 'tool_end', { id, ok: result.ok, summary: result.summary })

    // 工具改了数据，通知前端刷新对应的缓存（第 26 章的 invalidate 思路）
    const invalidation = result.ok ? profile.invalidation(name, result) : null
    if (invalidation) sse(res, 'invalidate', invalidation)

    return result
  }
}
