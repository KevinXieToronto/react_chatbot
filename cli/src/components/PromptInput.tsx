import { useEffect, useRef } from 'react'
import { Box, Text, useInput, usePaste } from 'ink'
import {
  backspace,
  chars,
  deleteForward,
  insert,
  killToLineStart,
  lineEnd,
  lineStart,
  moveDown,
  moveLeft,
  moveRight,
  moveUp,
  position,
  type EditState,
} from '../input/editing'

interface Props {
  value: EditState
  onChange: (next: EditState) => void
  onSubmit: (text: string) => void
  /** 光标已经在第一行还按 ↑：翻到上一条历史 */
  onHistoryPrev?: () => void
  /** 光标已经在最后一行还按 ↓：翻到下一条历史 */
  onHistoryNext?: () => void
  focus: boolean
  placeholder?: string
}

/** 粘贴进来的文字统一成 \n 换行（Windows 的剪贴板是 \r\n，终端送来的常常是 \r） */
const normalize = (text: string) => text.replace(/\r\n?/g, '\n')

/**
 * 多行输入框。ink-text-input 只能输一行，这里自己写一个：
 *   Enter          发送
 *   \ + Enter      换行（行尾的反斜杠换成换行符）
 *   Ctrl+J         换行（Ctrl+J 就是换行符 LF，所有终端都一样）
 *   Shift+Enter    换行 —— 只有支持 kitty 键盘协议的终端才分得出来，见第二节
 *   ↑ / ↓          多行时在行间移动；到了第一行 / 最后一行再按，翻历史
 * Esc、Tab、Ctrl+C、Ctrl+L 不在这里处理，交给 App。
 */
export function PromptInput({ value, onChange, onSubmit, onHistoryPrev, onHistoryNext, focus, placeholder }: Props) {
  // 最新的状态放在 ref 里：一次 stdin 数据里可能解析出好几个按键，
  // 它们在同一次渲染之前依次到达，都要基于"上一个按键改完之后"的状态
  const latest = useRef(value)
  useEffect(() => {
    latest.current = value
  }, [value])

  function edit(next: EditState) {
    latest.current = next
    onChange(next)
  }

  useInput(
    (input, key) => {
      const s = latest.current
      if (key.escape || key.tab || (key.ctrl && (input === 'c' || input === 'l'))) return

      if (key.return) {
        // kitty 协议下的 Shift+Enter、以及 Alt+Enter（ESC + 回车）：换行
        if (key.shift || key.meta) return edit(insert(s, '\n'))
        // 光标前面是反斜杠：把它换成换行符
        const before = chars(s.value)[s.cursor - 1]
        if (before === '\\') return edit(insert(backspace(s), '\n'))
        onSubmit(s.value)
        return
      }
      // Ctrl+J 送来的是 LF（\n），Enter 送来的是 CR（\r）
      if (input === '\n') return edit(insert(s, '\n'))

      if (key.upArrow) {
        const up = moveUp(s)
        if (up) edit(up)
        else onHistoryPrev?.()
        return
      }
      if (key.downArrow) {
        const down = moveDown(s)
        if (down) edit(down)
        else onHistoryNext?.()
        return
      }
      if (key.leftArrow) return edit(moveLeft(s))
      if (key.rightArrow) return edit(moveRight(s))
      if (key.home || (key.ctrl && input === 'a')) return edit(lineStart(s))
      if (key.end || (key.ctrl && input === 'e')) return edit(lineEnd(s))
      if (key.ctrl && input === 'u') return edit(killToLineStart(s))
      if (key.backspace) return edit(backspace(s))
      if (key.delete) return edit(deleteForward(s))
      if (key.ctrl || key.meta || !input) return

      // 普通字符；不支持括号粘贴的终端里，粘贴的一整段也从这里进来（里面的 \r 是换行，不是发送）
      edit(insert(s, normalize(input)))
    },
    { isActive: focus },
  )

  // 支持"括号粘贴"的终端（Windows Terminal 等）会把粘贴的内容用 ESC[200~ … ESC[201~ 包起来，
  // Ink 认出来后整段交给 usePaste，不会把里面的换行当成 Enter
  usePaste((text) => edit(insert(latest.current, normalize(text))), { isActive: focus })

  const { line: cursorLine, column: cursorColumn } = position(value)
  const lines = value.value.split('\n')
  const color = focus ? 'cyan' : 'gray'

  return (
    <Box flexDirection="column">
      {lines.map((text, i) => {
        const c = chars(text)
        const hasCursor = focus && i === cursorLine
        return (
          <Box key={i}>
            <Box flexShrink={0}>
              <Text color={color}>{i === 0 ? '❯ ' : '  '}</Text>
            </Box>
            {value.value === '' ? (
              <Text>
                {focus && <Text inverse> </Text>}
                <Text dimColor>{placeholder}</Text>
              </Text>
            ) : (
              <Text>
                {hasCursor ? c.slice(0, cursorColumn).join('') : text}
                {/* 光标：把光标所在的字反色；在行尾时反色一个空格 */}
                {hasCursor && <Text inverse>{c[cursorColumn] ?? ' '}</Text>}
                {hasCursor && c.slice(cursorColumn + 1).join('')}
              </Text>
            )}
          </Box>
        )
      })}
    </Box>
  )
}
