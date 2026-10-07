/**
 * 审批的"挂起 - 唤醒"机制。
 *
 * Agent 循环想执行一个需要批准的工具时：
 *   1. 生成 approvalId，把一个 Promise 的 resolve 存进 pending 这个 Map
 *   2. 通过 SSE 发 approval_required 给前端
 *   3. await 这个 Promise —— 循环就停在这里了
 * 用户点"允许 / 拒绝"时，前端 POST /chat/approvals/:id，
 * 路由调 resolveApproval() 找到那个 resolve 并调用它，循环继续往下走。
 *
 * ⚠️ pending 是【进程内存】里的 Map：
 *    - 只适用于单实例。部署成多个实例时，SSE 连接在 A 实例上，POST 可能打到 B 实例，
 *      B 的 Map 里根本没有这个 id。生产环境要把审批状态放进 Redis 之类的共享存储，
 *      用 pub/sub 通知持有连接的那个实例（或者用粘性会话保证同一个用户总打到同一台）。
 *    - 进程重启，所有等待中的审批全部丢失（对应的 SSE 连接也断了，所以问题不大）。
 */

const pending = new Map()

/** 审批超时时间。可以用环境变量 APPROVAL_TIMEOUT_MS 覆盖，方便测试 */
export function approvalTimeoutMs() {
  const n = Number(process.env.APPROVAL_TIMEOUT_MS)
  return Number.isFinite(n) && n > 0 ? n : 120_000
}

/**
 * 请求审批，返回一个 Promise：
 *   - 用户允许 / 拒绝：resolve({ decision: 'allow' | 'deny', note, by: 'user' })
 *   - 超时：resolve({ decision: 'deny', note: '', by: 'timeout' })
 *   - 客户端断开 / 用户停止：reject(AbortError)
 *
 * @param {{ toolUseId, name, input, reason }} request
 * @param {{ emit: (event, data) => void, signal: AbortSignal, timeoutMs?: number }} options
 */
export function requestApproval(request, { emit, signal, timeoutMs = approvalTimeoutMs() }) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('已中止', 'AbortError'))
      return
    }

    const approvalId = crypto.randomUUID()

    function cleanup() {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      pending.delete(approvalId)
    }

    /** 只会生效一次：先到的赢（用户点击 / 超时 / 断开） */
    function settle(decision) {
      if (!pending.has(approvalId)) return false
      cleanup()
      // 告诉前端"这个审批结束了"—— 超时的时候前端要靠它把卡片收起来
      emit('approval_resolved', {
        approvalId,
        toolUseId: request.toolUseId,
        decision: decision.decision,
        by: decision.by,
      })
      resolve(decision)
      return true
    }

    function onAbort() {
      // 连接断了：不发任何事件（发了也没人收），清理干净就走
      cleanup()
      reject(new DOMException('已中止', 'AbortError'))
    }

    const timer = setTimeout(() => settle({ decision: 'deny', note: '', by: 'timeout' }), timeoutMs)
    signal.addEventListener('abort', onAbort, { once: true })
    pending.set(approvalId, { settle, name: request.name, createdAt: Date.now() })

    emit('approval_required', { approvalId, ...request, timeoutMs })
  })
}

/**
 * 用户做出决定。找不到 id（不存在 / 已超时 / 已处理过）返回 false。
 */
export function resolveApproval(approvalId, decision, note = '') {
  const entry = pending.get(approvalId)
  if (!entry) return false
  return entry.settle({ decision, note, by: 'user' })
}

/** 当前还在等待的审批（调试用：只给工具名和等了多久，不暴露 id） */
export function listPendingApprovals() {
  const now = Date.now()
  return [...pending.values()].map((p) => ({ name: p.name, waitingMs: now - p.createdAt }))
}
