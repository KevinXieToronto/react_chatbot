import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from 'ink-testing-library'
import { PromptInput } from './PromptInput'
import { EMPTY, type EditState } from '../input/editing'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** 包一层状态，让 PromptInput 像在 App 里一样是受控的 */
function Harness({ onSubmit, onHistoryPrev }: { onSubmit: (t: string) => void; onHistoryPrev?: () => void }) {
  const [value, setValue] = useState<EditState>(EMPTY)
  return <PromptInput value={value} onChange={setValue} onSubmit={onSubmit} onHistoryPrev={onHistoryPrev} focus />
}

async function setup(onHistoryPrev?: () => void) {
  const onSubmit = vi.fn()
  const r = render(<Harness onSubmit={onSubmit} onHistoryPrev={onHistoryPrev} />)
  await sleep(50) // 等 useInput 挂上监听
  const press = async (s: string) => {
    r.stdin.write(s)
    await sleep(20)
  }
  return { ...r, onSubmit, press }
}

afterEach(() => {
  cleanup()
})

describe('PromptInput', () => {
  it('Enter 发送', async () => {
    const { press, onSubmit } = await setup()
    await press('你好')
    await press('\r')
    expect(onSubmit).toHaveBeenCalledWith('你好')
  })

  it('\\ + Enter、Ctrl+J、Shift+Enter（kitty 协议）都是换行，不发送', async () => {
    const { press, onSubmit, lastFrame } = await setup()
    await press('第一行\\')
    await press('\r') // 反斜杠 + 回车
    await press('第二行')
    await press('\n') // Ctrl+J
    await press('第三行')
    await press('\u001B[13;2u') // 支持 kitty 键盘协议的终端里，Shift+Enter 长这样
    await press('第四行')
    expect(onSubmit).not.toHaveBeenCalled()
    expect(lastFrame()).toContain('❯ 第一行\n  第二行\n  第三行\n  第四行')

    await press('\r')
    expect(onSubmit).toHaveBeenCalledWith('第一行\n第二行\n第三行\n第四行')
  })

  it('粘贴多行文字：换行留在输入框里，不会被当成 Enter', async () => {
    const { press, onSubmit, lastFrame } = await setup()
    await press('\u001B[200~line1\r\nline2\u001B[201~') // 括号粘贴
    await press('ab\rcd') // 不支持括号粘贴的终端：一整段里夹着 \r
    expect(onSubmit).not.toHaveBeenCalled()
    expect(lastFrame()).toContain('line1\n  line2ab\n  cd')
  })

  it('光标在第一行时按 ↑：交给调用方去翻历史', async () => {
    const onHistoryPrev = vi.fn()
    const { press } = await setup(onHistoryPrev)
    await press('a\\')
    await press('\r')
    await press('b')
    await press('\u001B[A') // 第二行 → 第一行：只是移动光标
    expect(onHistoryPrev).not.toHaveBeenCalled()
    await press('\u001B[A') // 已经在第一行
    expect(onHistoryPrev).toHaveBeenCalledTimes(1)
  })
})
