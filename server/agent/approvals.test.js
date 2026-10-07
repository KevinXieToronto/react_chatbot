// 审批的"挂起 - 唤醒"机制：不用起服务器，直接调函数测

import { describe, it, expect } from 'vitest'
import { requestApproval, resolveApproval, listPendingApprovals } from './approvals.js'

/** 造一个假的 emit，记录发出的事件 */
function recorder() {
  const events = []
  return { events, emit: (event, data) => events.push({ event, data }) }
}

const request = { toolUseId: 't1', name: 'edit_file', input: { path: 'a.js' }, reason: 'test' }

describe('requestApproval', () => {
  it('用户允许 → resolve allow，并发出 required / resolved 两个事件', async () => {
    const { events, emit } = recorder()
    const p = requestApproval(request, { emit, signal: new AbortController().signal })

    const { approvalId } = events[0].data
    expect(events[0].event).toBe('approval_required')
    expect(resolveApproval(approvalId, 'allow')).toBe(true)

    await expect(p).resolves.toMatchObject({ decision: 'allow', by: 'user' })
    expect(events[1]).toMatchObject({ event: 'approval_resolved', data: { decision: 'allow' } })
  })

  it('用户拒绝时带上备注', async () => {
    const { events, emit } = recorder()
    const p = requestApproval(request, { emit, signal: new AbortController().signal })
    resolveApproval(events[0].data.approvalId, 'deny', '先别改')
    await expect(p).resolves.toMatchObject({ decision: 'deny', note: '先别改' })
  })

  it('超时自动拒绝', async () => {
    const { emit } = recorder()
    const p = requestApproval(request, { emit, signal: new AbortController().signal, timeoutMs: 20 })
    await expect(p).resolves.toMatchObject({ decision: 'deny', by: 'timeout' })
  })

  it('客户端断开 → reject AbortError，并从 Map 里清掉', async () => {
    const { events, emit } = recorder()
    const ctrl = new AbortController()
    const p = requestApproval(request, { emit, signal: ctrl.signal })
    expect(listPendingApprovals()).toHaveLength(1)

    ctrl.abort()
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
    expect(listPendingApprovals()).toHaveLength(0)
    // 已经清掉的 id 再批准，返回 false（路由会回 404）
    expect(resolveApproval(events[0].data.approvalId, 'allow')).toBe(false)
  })

  it('同一个审批只能决定一次', async () => {
    const { events, emit } = recorder()
    const p = requestApproval(request, { emit, signal: new AbortController().signal })
    const id = events[0].data.approvalId
    expect(resolveApproval(id, 'deny')).toBe(true)
    expect(resolveApproval(id, 'allow')).toBe(false)
    await expect(p).resolves.toMatchObject({ decision: 'deny' })
  })

  it('不认识的 id 返回 false', () => {
    expect(resolveApproval('no-such-id', 'allow')).toBe(false)
  })
})
