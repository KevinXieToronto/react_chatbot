import { useEffect, useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { TOOL_LABELS, type ApprovalDecision, type PendingApproval } from '@taskflow/agent-core'
import { EMPTY, type EditState } from '../input/editing'
import { DiffView } from './DiffView'
import { PromptInput } from './PromptInput'

/** 提示出现后这么久内不认按键：防止用户"提前打的字"顺手批准了（第 30 章网页端是 400ms） */
export const KEY_GUARD_MS = 400

interface Props {
  approval: PendingApproval
  /** 用户做了决定。always = 本会话以后都自动允许这个工具 */
  onDecide: (decision: ApprovalDecision, note: string, always: boolean) => Promise<void>
  /** Esc / Ctrl+C：拒绝并中止这一轮（和第 30 章网页端的"停止"一样） */
  onAbort: () => void
  /** diff 最多显示几行 */
  maxDiffRows: number
}

/** 每秒刷新一次的"现在"，给倒计时用 */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  return now
}

/** 没有 diff 的工具（比如 run_command）：把参数一项项列出来 */
function InputFields({ input }: { input: unknown }) {
  if (!input || typeof input !== 'object') return <Text>{JSON.stringify(input)}</Text>
  const entries = Object.entries(input as Record<string, unknown>)
  return (
    <Box flexDirection="column">
      {entries.map(([key, value]) =>
        key === 'command' ? (
          <Text key={key}>
            <Text dimColor>$ </Text>
            <Text bold>{String(value)}</Text>
          </Text>
        ) : (
          <Text key={key} wrap="truncate-end">
            <Text dimColor>{key}：</Text>
            {typeof value === 'string' ? value.split('\n')[0] : JSON.stringify(value)}
          </Text>
        ),
      )}
    </Box>
  )
}

type Phase = 'choose' | 'note' | 'submitting'

/**
 * 终端里的审批提示（网页端是第 30 章的 ApprovalCard）。
 *   y 允许 · n 拒绝 · e 拒绝并附说明 · a 本会话总是允许这个工具 · Esc 拒绝并中止
 *
 * 故意不让 Enter 表示"允许"：用户可能在上一句话还没回完时就开始打下一句，
 * 那个 Enter 不该变成一次批准。必须明确地按 y。
 */
export function ApprovalPrompt({ approval, onDecide, onAbort, maxDiffRows }: Props) {
  const [phase, setPhase] = useState<Phase>('choose')
  const [note, setNote] = useState<EditState>(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const now = useNow()

  // 新的审批出现时：短暂屏蔽按键
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), KEY_GUARD_MS)
    return () => clearTimeout(timer)
  }, [approval.approvalId])

  const label = TOOL_LABELS[approval.name] ?? approval.name
  const seconds = Math.max(0, Math.ceil((approval.expiresAt - now) / 1000))

  async function submit(decision: ApprovalDecision, text = '', always = false) {
    setPhase('submitting')
    setError(null)
    try {
      await onDecide(decision, text, always)
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败')
      setPhase('choose')
    }
  }

  useInput((input, key) => {
    if (key.ctrl && input === 'c') return onAbort()
    if (phase === 'note') {
      // 写备注时 Esc 只是"不写了"，回到选择；文字本身由下面的 PromptInput 处理
      if (key.escape) setPhase('choose')
      return
    }
    if (key.escape) return onAbort()
    if (!ready || phase !== 'choose') return
    switch (input.toLowerCase()) {
      case 'y':
        return void submit('allow')
      case 'n':
        return void submit('deny')
      case 'a':
        return void submit('allow', '', true)
      case 'e':
        setNote(EMPTY)
        setPhase('note')
    }
  })

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1}>
      <Box justifyContent="space-between">
        <Text bold color="yellow">
          ⚠ 需要你确认 · {label}
        </Text>
        <Text color={seconds <= 10 ? 'red' : 'yellow'}>{seconds} 秒后自动拒绝</Text>
      </Box>
      {approval.reason && <Text dimColor>{approval.reason}</Text>}

      <Box marginY={1} flexDirection="column">
        {approval.preview ? (
          <DiffView preview={approval.preview} maxRows={maxDiffRows} />
        ) : (
          <InputFields input={approval.input} />
        )}
      </Box>

      {phase === 'note' ? (
        <Box flexDirection="column">
          <Text>拒绝，并告诉 AI 为什么（Enter 提交，Esc 返回）：</Text>
          <PromptInput
            value={note}
            onChange={setNote}
            onSubmit={(text) => void submit('deny', text.trim())}
            focus
            placeholder="比如：不要改这个文件，改 src/utils.js"
          />
        </Box>
      ) : phase === 'submitting' ? (
        <Text dimColor>提交中…</Text>
      ) : (
        <Text>
          <Text color="green" bold>
            y
          </Text>
          <Text> 允许 · </Text>
          <Text color="red" bold>
            n
          </Text>
          <Text> 拒绝 · </Text>
          <Text bold>e</Text>
          <Text> 拒绝并附说明 · </Text>
          <Text bold>a</Text>
          <Text> 本会话总是允许「{label}」 · </Text>
          <Text bold>Esc</Text>
          <Text> 拒绝并中止</Text>
        </Text>
      )}
      {error && <Text color="red">✗ {error}</Text>}
    </Box>
  )
}
