import { useState } from 'react'
import { Box, Static, useApp, useInput, useStdout, useWindowSize } from 'ink'
import type { ChatMode, StreamChat, SubmitApproval } from '@taskflow/agent-core'
import { API_URL } from './api'
import { useChat } from './useChat'
import { useHistory } from './history'
import { COMMANDS, completeCommand, findCommand, parseCommand, type CommandContext } from './commands'
import { EMPTY, fromText, type EditState } from './input/editing'
import { PERMISSION_LABELS, autoDecide, nextPermissionMode, type PermissionMode } from './permissions'
import { liveItems, type Entry } from './transcript'
import { ApprovalPrompt } from './components/ApprovalPrompt'
import { BlockView, EntryView } from './components/EntryView'
import { CommandHint } from './components/CommandHint'
import { PromptInput } from './components/PromptInput'
import { StatusBar } from './components/StatusBar'
import { ToolLine } from './components/ToolLine'

interface Props {
  /** 测试时注入假的流；不传就用真正的 fetch */
  stream?: StreamChat
  /** 测试时注入假的审批接口（第 39 章） */
  submitApproval?: SubmitApproval
  timeoutMs?: number
  /** 启动时的模式，默认 tasks */
  initialMode?: ChatMode
  /** 历史文件的位置。测试时传一个临时文件，免得写进你真正的主目录 */
  historyFile?: string
}

/** 标题栏是 <Static> 的第一项，永远在最上面 */
const HEADER: Entry = { kind: 'header', id: 'header' }

/** 清屏 + 清掉回滚区 + 光标回到左上角 */
const CLEAR_TERMINAL = '\x1b[2J\x1b[3J\x1b[H'

export function App({ stream, submitApproval, timeoutMs, initialMode = 'tasks', historyFile }: Props) {
  const { exit } = useApp()
  const { stdout } = useStdout()
  // 终端的宽高。用户拖动窗口大小时，这个 Hook 会让组件重新渲染
  const { columns, rows } = useWindowSize()
  const [mode, setMode] = useState<ChatMode>(initialMode)
  // 第 39 章：客户端的权限模式，和"本会话总是允许"的工具
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('default')
  const [alwaysAllowed, setAlwaysAllowed] = useState<ReadonlySet<string>>(new Set())
  const chat = useChat({
    stream,
    submitApproval,
    timeoutMs,
    mode,
    autoDecide: (approval) => autoDecide(permissionMode, alwaysAllowed, approval),
  })
  const { entries, turn, live, outputs, busy, approval } = chat
  const [input, setInput] = useState<EditState>(EMPTY)
  const history = useHistory(historyFile)
  // 换一个 key，<Static> 就会重新挂载：从头开始画，Ink 也会丢掉它记着的旧静态输出
  const [staticKey, setStaticKey] = useState(0)

  function clearScreen() {
    stdout.write(CLEAR_TERMINAL)
    chat.clearEntries()
    setStaticKey((k) => k + 1)
  }

  const commandContext: CommandContext = {
    mode,
    setMode,
    clearScreen,
    newSession: () => {
      chat.resetSession()
      setAlwaysAllowed(new Set())
      clearScreen()
    },
    permissionMode,
    setPermissionMode,
    exit: () => exit(),
    print: chat.notify,
    usage: chat.usage,
    lastUsage: chat.lastUsage,
    context: chat.context,
  }

  function cyclePermissionMode() {
    const next = nextPermissionMode(permissionMode)
    setPermissionMode(next)
    chat.notify(`权限模式：${PERMISSION_LABELS[next]}`)
  }

  // 全局快捷键。PromptInput 会跳过 Esc、Tab、Ctrl+C、Ctrl+L，它们都在这里处理。
  // 审批提示出现时，按键全部交给 ApprovalPrompt（isActive: false）
  useInput(
    (char, key) => {
      const ctrlC = key.ctrl && char === 'c'
      if (key.tab && key.shift) {
        cyclePermissionMode() // Shift+Tab：忙的时候也能切，下一次审批就按新模式来
        return
      }
      if (busy) {
        if (ctrlC || key.escape) chat.abort() // 忙：中止这一轮
        return
      }
      if (key.ctrl && char === 'l') {
        clearScreen()
        return
      }
      if (key.tab) {
        const completed = completeCommand(input.value)
        if (completed) setInput(fromText(completed))
        return
      }
      if (ctrlC || key.escape) {
        // 和 shell 一样：输入框里有字就先清空；空着再按 Ctrl+C 才退出
        if (input.value !== '') {
          setInput(EMPTY)
          history.reset()
        } else if (ctrlC) {
          exit()
        }
      }
    },
    { isActive: approval === null },
  )

  function handleSubmit(text: string) {
    if (!text.trim() || busy) return
    history.push(text)
    setInput(EMPTY)

    const parsed = parseCommand(text)
    if (!parsed) {
      void chat.send(text)
      return
    }
    const command = findCommand(parsed.name)
    if (command) {
      command.run(commandContext, parsed.args)
    } else {
      chat.notify(
        `没有 /${parsed.name} 这个命令。可用的命令：${COMMANDS.map((c) => '/' + c.name).join(' ')}。` +
          '\n想把以 / 开头的一句话发给模型，在前面加一个空格。',
        'error',
      )
    }
  }

  // 正在输出的代码块最多显示几行：给输入框、状态栏和别的内容留出 12 行。
  // 动态区一旦比窗口还高，Ink 就只能整屏重画（第 35 章），会闪
  const liveCodeLines = Math.max(3, rows - 12)

  return (
    <Box flexDirection="column">
      {/* 写进去就不再重画。清屏时换一个 key，让它从标题栏重新开始 */}
      <Static key={staticKey} items={[HEADER, ...entries]}>
        {(entry) => <EntryView key={entry.id} entry={entry} width={columns} apiUrl={API_URL} mode={mode} />}
      </Static>

      {/* 动态区：只剩还在跑的工具、还没写完的那一块 */}
      {busy &&
        liveItems(live.segments, live.cursor, turn.toolCalls).map((item) =>
          item.kind === 'tool' ? (
            <ToolLine key={item.key} call={item.call} output={outputs[item.call.id]} />
          ) : (
            <BlockView
              key={item.key}
              token={item.token}
              lead={item.lead}
              width={columns}
              maxCodeLines={item.last ? liveCodeLines : undefined}
            />
          ),
        )}

      {/* 等审批时，输入框的位置换成审批提示 */}
      {approval ? (
        <ApprovalPrompt
          key={approval.approvalId}
          approval={approval}
          maxDiffRows={Math.max(6, rows - 16)}
          onAbort={chat.abort}
          onDecide={async (decision, note, always) => {
            if (always) setAlwaysAllowed((prev) => new Set(prev).add(approval.name))
            await chat.decide(decision, note)
          }}
        />
      ) : (
        <Box borderStyle="round" borderColor={busy ? 'gray' : 'cyan'} paddingX={1}>
          <PromptInput
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            onHistoryPrev={() => {
              const text = history.prev(input.value)
              if (text !== null) setInput(fromText(text))
            }}
            onHistoryNext={() => {
              const text = history.next()
              if (text !== null) setInput(fromText(text))
            }}
            focus={!busy}
            placeholder={busy ? '等待回复中…' : '输入消息，Enter 发送，\\ + Enter 换行'}
          />
        </Box>
      )}
      {!busy && input.value.startsWith('/') && <CommandHint text={input.value} />}
      <Box paddingX={1}>
        <StatusBar
          mode={mode}
          permissionMode={permissionMode}
          turn={turn}
          busy={busy}
          count={chat.messages.length}
          context={chat.context}
          usage={chat.usage}
          lastUsage={chat.lastUsage}
        />
      </Box>
    </Box>
  )
}
