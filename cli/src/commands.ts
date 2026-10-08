import {
  cacheHitRate,
  estimateCost,
  type ChatMode,
  type ContextReport,
  type UsageTotals,
} from '@taskflow/agent-core'
import { PERMISSION_HELP, PERMISSION_LABELS, PERMISSION_MODES, type PermissionMode } from './permissions'

/** 三种模式（第 29、34 章），服务端的 profiles.js 里是同一张白名单 */
export const MODES: Record<ChatMode, string> = {
  tasks: '任务 Copilot：查询和修改看板上的任务',
  code: '代码助手：读写 workspace/，改文件和执行命令前要你确认',
  sdk: '代码助手，由 OpenAI Agents SDK 驱动',
}

export const isMode = (s: string): s is ChatMode => Object.hasOwn(MODES, s)

/** /permissions 的参数写法 → 权限模式（第 39 章） */
const PERMISSION_ARGS: Record<string, PermissionMode> = {
  default: 'default',
  'accept-edits': 'acceptEdits',
  plan: 'plan',
}

/** 命令能用到的"外部能力"。命令本身不直接碰 React 状态，全部通过这个对象 */
export interface CommandContext {
  mode: ChatMode
  setMode: (mode: ChatMode) => void
  /** 清屏，对话保留 */
  clearScreen: () => void
  /** 新会话：清空对话、用量、"总是允许"的工具，并清屏 */
  newSession: () => void
  permissionMode: PermissionMode
  setPermissionMode: (mode: PermissionMode) => void
  exit: () => void
  /** 在对话里印一段提示（不会发给模型） */
  print: (text: string, tone?: 'info' | 'warn' | 'error') => void
  usage: UsageTotals | null
  lastUsage: UsageTotals | null
  context: ContextReport | null
}

export interface SlashCommand {
  name: string
  /** 参数的写法，给 /help 和补全提示看 */
  args?: string
  description: string
  run: (ctx: CommandContext, args: string) => void
}

const n = (x: number | undefined) => (x ?? 0).toLocaleString('en-US')

export const COMMANDS: SlashCommand[] = [
  {
    name: 'help',
    description: '列出所有命令和快捷键',
    run: (ctx) =>
      ctx.print(
        [
          '命令：',
          ...COMMANDS.map((c) => `  /${c.name}${c.args ? ' ' + c.args : ''}`.padEnd(26) + c.description),
          '',
          '快捷键：',
          '  Enter 发送 · \\ + Enter 或 Ctrl+J 换行 · ↑/↓ 翻历史 · Tab 补全命令',
          '  Esc 清空输入 / 中止回复 · Ctrl+L 清屏 · Ctrl+C 中止回复 / 退出',
          '  Shift+Tab 切换权限模式（默认 → 自动接受编辑 → 只读计划）',
        ].join('\n'),
      ),
  },
  {
    name: 'mode',
    args: 'tasks|code|sdk',
    description: '切换模式（不带参数时显示当前模式）',
    run: (ctx, args) => {
      const next = args.trim()
      if (!next) {
        ctx.print(`当前模式：${ctx.mode} —— ${MODES[ctx.mode]}`)
        return
      }
      if (!isMode(next)) {
        ctx.print(`没有 ${next} 这个模式，可选：${Object.keys(MODES).join(' / ')}`, 'error')
        return
      }
      ctx.setMode(next)
      ctx.print(`已切换到 ${next} 模式：${MODES[next]}。之前的对话还在上下文里，想从头来就用 /new。`)
    },
  },
  {
    name: 'permissions',
    args: 'default|accept-edits|plan',
    description: '切换权限模式（不带参数时显示当前模式）',
    run: (ctx, args) => {
      const arg = args.trim()
      if (!arg) {
        ctx.print(
          PERMISSION_MODES.map(
            (m) => `${m === ctx.permissionMode ? '●' : '○'} ${PERMISSION_LABELS[m]}：${PERMISSION_HELP[m]}`,
          ).join('\n') + '\n不管哪种模式，要不要问人都由服务端决定；这里只决定"服务端问了以后，要不要替你自动回答"。',
        )
        return
      }
      const next = PERMISSION_ARGS[arg]
      if (!next) {
        ctx.print(`没有 ${arg} 这个权限模式，可选：${Object.keys(PERMISSION_ARGS).join(' / ')}`, 'error')
        return
      }
      ctx.setPermissionMode(next)
      ctx.print(`权限模式：${PERMISSION_LABELS[next]}（${PERMISSION_HELP[next]}）`)
    },
  },
  {
    name: 'clear',
    description: '清屏（对话上下文保留）',
    run: (ctx) => ctx.clearScreen(),
  },
  {
    name: 'new',
    description: '开始新会话（清空对话、用量统计和"总是允许"）',
    run: (ctx) => ctx.newSession(),
  },
  {
    name: 'cost',
    description: '本会话累计的 token 用量和估算费用',
    run: (ctx) => {
      const u = ctx.usage
      if (!u) {
        ctx.print('还没有用量数据：一轮回复结束后才会有。')
        return
      }
      const hit = ctx.lastUsage ? `，上一轮缓存命中率 ${Math.round(cacheHitRate(ctx.lastUsage) * 100)}%` : ''
      ctx.print(
        `本会话累计：输入 ${n(u.input)} · 输出 ${n(u.output)} · 缓存读 ${n(u.cacheRead)} · 缓存写 ${n(u.cacheWrite)}\n` +
          `估算费用 $${estimateCost(u).toFixed(4)}${hit}。（Mock 模式的用量是模拟出来的）`,
      )
    },
  },
  {
    name: 'context',
    description: '最近一次发给模型的上下文大小',
    run: (ctx) => {
      const c = ctx.context
      if (!c) {
        ctx.print('还没有上下文数据：发一条消息之后再看。')
        return
      }
      const pct = c.budget > 0 ? Math.round((c.tokens / c.budget) * 100) : 0
      const trimmed =
        c.truncated > 0 || c.dropped > 0
          ? `\n整理前 ${n(c.before)}：截断了 ${c.truncated} 个旧工具结果，移除了 ${c.dropped} 条旧消息${c.summarized ? '（已生成摘要）' : ''}`
          : ''
      ctx.print(`上下文 ${n(c.tokens)} / ${n(c.budget)} tokens（${pct}%，${c.exact ? '精确计数' : '估算'}）${trimmed}`)
    },
  },
  {
    name: 'exit',
    description: '退出',
    run: (ctx) => ctx.exit(),
  },
]

export function findCommand(name: string): SlashCommand | undefined {
  return COMMANDS.find((c) => c.name === name)
}

/** "/mode code" → { name: 'mode', args: 'code' }；不是以 / 开头的返回 null */
export function parseCommand(text: string): { name: string; args: string } | null {
  const m = text.trim().match(/^\/(\S*)\s*([\s\S]*)$/)
  return m ? { name: m[1].toLowerCase(), args: m[2] } : null
}

/** 正在输入命令名时（以 / 开头、还没有空格），给出匹配的命令 */
export function suggestCommands(text: string): SlashCommand[] {
  if (!/^\/\S*$/.test(text)) return []
  const prefix = text.slice(1).toLowerCase()
  return COMMANDS.filter((c) => c.name.startsWith(prefix))
}

/** Tab 补全：补成第一个匹配的命令；要参数的命令后面补一个空格 */
export function completeCommand(text: string): string | null {
  const [first] = suggestCommands(text)
  if (!first) return null
  return `/${first.name}${first.args ? ' ' : ''}`
}
