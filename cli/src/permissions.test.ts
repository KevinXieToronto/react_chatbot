import { describe, expect, it } from 'vitest'
import type { PendingApproval } from '@taskflow/agent-core'
import { autoDecide, nextPermissionMode } from './permissions'

const approval = (name: string): PendingApproval => ({
  approvalId: 'a1',
  toolUseId: 't1',
  name,
  input: {},
  expiresAt: 0,
})

describe('autoDecide', () => {
  it('默认模式：什么都不自动回答', () => {
    expect(autoDecide('default', new Set(), approval('edit_file'))).toBeNull()
  })

  it('自动接受编辑：改文件自动允许，执行命令还是要问', () => {
    expect(autoDecide('acceptEdits', new Set(), approval('edit_file'))?.decision).toBe('allow')
    expect(autoDecide('acceptEdits', new Set(), approval('create_file'))?.decision).toBe('allow')
    expect(autoDecide('acceptEdits', new Set(), approval('run_command'))).toBeNull()
  })

  it('本会话总是允许：只对那一个工具生效', () => {
    const always = new Set(['run_command'])
    expect(autoDecide('default', always, approval('run_command'))?.decision).toBe('allow')
    expect(autoDecide('default', always, approval('edit_file'))).toBeNull()
  })

  it('只读计划优先级最高：连"总是允许"的工具也拒绝，并告诉模型为什么', () => {
    const d = autoDecide('plan', new Set(['run_command']), approval('run_command'))
    expect(d?.decision).toBe('deny')
    expect(d?.note).toContain('只读计划模式')
  })

  it('Shift+Tab 的循环顺序', () => {
    expect(nextPermissionMode('default')).toBe('acceptEdits')
    expect(nextPermissionMode('acceptEdits')).toBe('plan')
    expect(nextPermissionMode('plan')).toBe('default')
  })
})
