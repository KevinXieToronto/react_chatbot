/**
 * 工具权限策略 —— 全项目只有这一个地方决定"哪个工具要问人"。
 *
 * - allow：直接执行
 * - ask：执行前必须等用户批准
 *
 * 规则很朴素：只读的放行，会改东西或能执行任意代码的必须问。
 */
const POLICY = {
  // 代码助手
  list_files: 'allow',
  read_file: 'allow',
  search: 'allow',
  create_file: 'ask',
  edit_file: 'ask',
  run_command: 'ask',

  // 任务 Copilot（第 25 章）。练习：把 delete_task 改成 'ask' 试试
  list_tasks: 'allow',
  create_task: 'allow',
  update_task: 'allow',
  delete_task: 'allow',
}

/**
 * SDK 引擎（第 34 章）里，任务工具通过 MCP 交给 OpenAI Agents SDK，
 * 模型看到的名字是 mcp_taskflow__list_tasks 这种（SDK 按 mcp_<服务器名>__<工具名> 加的前缀）。
 * 去掉前缀再查表，两种引擎用的就是同一条规则。
 */
function policyName(name) {
  return String(name).replace(/^mcp_taskflow__/, '')
}

/**
 * 要不要先问用户。
 * ⚠️ 不在表里的工具一律按 'ask' 处理（fail-safe）：
 *    以后新加了工具却忘了登记，宁可多问一次，也不能默认放行。
 */
export function needsApproval(name) {
  const key = policyName(name)
  const rule = Object.hasOwn(POLICY, key) ? POLICY[key] : 'ask'
  return rule === 'ask'
}

/** 给用户看的一句话：这个操作会造成什么影响 */
export function approvalReason(name, input) {
  switch (policyName(name)) {
    case 'create_file':
      return `会新建文件 ${input?.path ?? ''}`
    case 'edit_file':
      return `会修改文件 ${input?.path ?? ''}`
    case 'run_command':
      return '会在工作区执行一条命令。命令不受路径沙箱限制，能做到当前用户能做的任何事'
    default:
      return '这个操作需要你确认'
  }
}
