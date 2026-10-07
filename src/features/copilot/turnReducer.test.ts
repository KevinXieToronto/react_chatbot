import { describe, it, expect } from 'vitest'
import { turnReducer, initialTurnState, describePhase } from './turnReducer'
import type { TurnAction, TurnState } from './turnReducer'
import type { PendingApproval } from '../../types/chat'

/** 从初始状态开始依次执行一串 action */
function run(...actions: TurnAction[]): TurnState {
  return actions.reduce(turnReducer, initialTurnState)
}

const approval: PendingApproval = {
  approvalId: 'a1',
  toolUseId: 't1',
  name: 'edit_file',
  input: { path: 'src/math.js' },
  expiresAt: 0,
}

const startTool: TurnAction = { type: 'tool_start', id: 't1', name: 'edit_file', input: {} }

describe('turnReducer：审批', () => {
  it('approval_required → 进入 awaiting_approval，对应工具标成 awaiting', () => {
    const s = run({ type: 'start' }, startTool, { type: 'approval_required', approval })
    expect(s.phase).toBe('awaiting_approval')
    expect(s.approval?.approvalId).toBe('a1')
    expect(s.toolCalls[0].status).toBe('awaiting')
    expect(describePhase(s)).toBe('等你确认：修改文件')
  })

  it('等审批期间收到文本，阶段仍然是 awaiting_approval', () => {
    const s = run({ type: 'start' }, startTool, { type: 'approval_required', approval }, { type: 'delta', text: '…' })
    expect(s.phase).toBe('awaiting_approval')
  })

  it('approval_resolved → 卡片收起，工具回到 running', () => {
    const s = run(
      { type: 'start' },
      startTool,
      { type: 'approval_required', approval },
      { type: 'approval_resolved', approvalId: 'a1' },
    )
    expect(s.approval).toBeNull()
    expect(s.phase).toBe('tooling')
    expect(s.toolCalls[0].status).toBe('running')
  })

  it('拒绝后服务端发来 tool_end(ok: false)，工具变成 error', () => {
    const s = run(
      { type: 'start' },
      startTool,
      { type: 'approval_required', approval },
      { type: 'approval_resolved', approvalId: 'a1' },
      { type: 'tool_end', id: 't1', ok: false, summary: '已拒绝' },
    )
    expect(s.toolCalls[0]).toMatchObject({ status: 'error', summary: '已拒绝' })
    expect(s.phase).toBe('streaming')
  })

  it('迟到的、不匹配的 approval_resolved 被忽略', () => {
    const before = run({ type: 'start' }, startTool, { type: 'approval_required', approval })
    const after = turnReducer(before, { type: 'approval_resolved', approvalId: 'old' })
    expect(after).toBe(before)
  })

  it('等审批时点停止：审批清空，awaiting 的工具标成已取消', () => {
    const s = run({ type: 'start' }, startTool, { type: 'approval_required', approval }, { type: 'abort' })
    expect(s.phase).toBe('aborted')
    expect(s.approval).toBeNull()
    expect(s.toolCalls[0]).toMatchObject({ status: 'error', summary: '已取消' })
  })

  it('出错时同样清掉审批和进行中的工具', () => {
    const s = run({ type: 'start' }, startTool, { type: 'approval_required', approval }, { type: 'error', message: 'x' })
    expect(s.approval).toBeNull()
    expect(s.toolCalls[0].status).toBe('error')
  })
})

describe('turnReducer：diff 预览（第 31 章）', () => {
  it('approval_required 把 preview 记到对应的工具调用上，结束后还在', () => {
    const preview = { path: 'src/math.js', isNew: false, additions: 1, deletions: 1, tooLarge: false, hunks: [] }
    const s = run(
      { type: 'start' },
      startTool,
      { type: 'approval_required', approval: { ...approval, preview } },
      { type: 'approval_resolved', approvalId: 'a1' },
      { type: 'tool_end', id: 't1', ok: true, summary: '已修改' },
    )
    expect(s.toolCalls[0]).toMatchObject({ status: 'success', preview })
  })
})
