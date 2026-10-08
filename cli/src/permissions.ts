import type { ApprovalDecision, PendingApproval } from '@taskflow/agent-core'

/**
 * 客户端的权限模式。
 *
 * ⚠️ 真正决定"哪个工具要问人"的是服务端的 permissions.js（第 30 章）。
 * 这里只决定：服务端已经停下来问了，要不要替用户自动回答。它不能让服务端少问一次，
 * 也绕不过服务端的沙箱和 diff 校验。
 */
export type PermissionMode = 'default' | 'acceptEdits' | 'plan'

export const PERMISSION_MODES: PermissionMode[] = ['default', 'acceptEdits', 'plan']

export const PERMISSION_LABELS: Record<PermissionMode, string> = {
  default: '默认',
  acceptEdits: '自动接受编辑',
  plan: '只读计划',
}

export const PERMISSION_HELP: Record<PermissionMode, string> = {
  default: '每次都问你',
  acceptEdits: '新建、修改文件自动允许；执行命令还是要问',
  plan: '改文件、执行命令一律自动拒绝，让 AI 先把计划说清楚',
}

/**
 * "编辑类"工具：只改工作区里的文件。执行命令（run_command）不在其中。
 * 两个引擎都用这两个名字：第 34 章的 OpenAI Agents SDK 引擎用的也是我们自己的代码工具
 */
export const EDIT_TOOLS: ReadonlySet<string> = new Set(['create_file', 'edit_file'])

/** Shift+Tab：默认 → 自动接受编辑 → 只读计划 → 默认 */
export function nextPermissionMode(mode: PermissionMode): PermissionMode {
  return PERMISSION_MODES[(PERMISSION_MODES.indexOf(mode) + 1) % PERMISSION_MODES.length]
}

export interface AutoDecision {
  decision: ApprovalDecision
  /** 拒绝时告诉模型的话（第 30 章的 note） */
  note: string
  /** 印在对话里给用户看的原因 */
  reason: string
}

/**
 * 服务端要求审批时，要不要自动回答。返回 null 表示"弹出来问用户"。
 * 优先级：只读计划 > 本会话总是允许 > 自动接受编辑。
 */
export function autoDecide(
  mode: PermissionMode,
  alwaysAllowed: ReadonlySet<string>,
  approval: PendingApproval,
): AutoDecision | null {
  if (mode === 'plan') {
    return {
      decision: 'deny',
      note: '现在是只读计划模式：先不要修改文件或执行命令，把你打算怎么做写成计划告诉我。',
      reason: '只读计划模式，已自动拒绝',
    }
  }
  if (alwaysAllowed.has(approval.name)) {
    return { decision: 'allow', note: '', reason: '本会话总是允许这个工具，已自动允许' }
  }
  if (mode === 'acceptEdits' && EDIT_TOOLS.has(approval.name)) {
    return { decision: 'allow', note: '', reason: '自动接受编辑模式，已自动允许' }
  }
  return null
}
