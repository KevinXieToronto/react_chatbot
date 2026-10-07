import { useEffect, useRef } from 'react'
import { Terminal, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useTheme } from '../../contexts/ThemeContext'
import { readOutput, subscribeOutput } from './terminalBuffer'

/**
 * 两套配色。ANSI 的 16 色在亮色背景上要调深一点，不然黄色、青色几乎看不见。
 * 颜色取自 Tailwind 的调色板，和页面其他部分保持一致。
 */
const THEMES: Record<'light' | 'dark', ITheme> = {
  light: {
    background: '#f8fafc',
    foreground: '#1e293b',
    cursor: '#f8fafc',
    selectionBackground: '#bfdbfe',
    black: '#1e293b',
    red: '#dc2626',
    green: '#15803d',
    yellow: '#a16207',
    blue: '#1d4ed8',
    magenta: '#a21caf',
    cyan: '#0e7490',
    white: '#64748b',
    brightBlack: '#475569',
    brightRed: '#ef4444',
    brightGreen: '#16a34a',
    brightYellow: '#ca8a04',
    brightBlue: '#2563eb',
    brightMagenta: '#c026d3',
    brightCyan: '#0891b2',
    brightWhite: '#334155',
  },
  dark: {
    background: '#0f172a',
    foreground: '#e2e8f0',
    cursor: '#0f172a',
    selectionBackground: '#334155',
    black: '#475569',
    red: '#f87171',
    green: '#4ade80',
    yellow: '#facc15',
    blue: '#60a5fa',
    magenta: '#e879f9',
    cyan: '#22d3ee',
    white: '#cbd5e1',
    brightBlack: '#64748b',
    brightRed: '#fca5a5',
    brightGreen: '#86efac',
    brightYellow: '#fde047',
    brightBlue: '#93c5fd',
    brightMagenta: '#f0abfc',
    brightCyan: '#67e8f9',
    brightWhite: '#f8fafc',
  },
}

interface XTerminalProps {
  /** 显示哪一次 run_command 的输出；null = 还没跑过命令 */
  toolUseId: string | null
}

/**
 * 只读终端。
 *
 * xterm.js 是一个"外部系统"（第 08 章）：它自己管理 DOM、自己画字符、自己处理滚动。
 * React 在这里只做三件事：给它一个容器（ref）、在合适的时机创建 / 销毁它、把新输出交给它。
 * 每来一块输出直接调 term.write()，【不】经过 state —— 输出再多，React 也不会重渲染一次。
 */
export default function XTerminal({ toolUseId }: XTerminalProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const { resolved } = useTheme()

  // ① 创建 / 销毁。空依赖：组件活着的时候只有一个 Terminal 实例
  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const term = new Terminal({
      // 子进程的换行多半是 \n，终端需要 \r\n 才会回到行首
      convertEol: true,
      // 只读：不接收键盘输入（我们的命令本来也没有 stdin）
      disableStdin: true,
      cursorInactiveStyle: 'none',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      fontSize: 12,
      scrollback: 5000,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)
    fit.fit()

    // 容器大小变了（拖动窗口、切换大小屏布局）就重新算行列数
    const observer = new ResizeObserver(() => fit.fit())
    observer.observe(host)

    termRef.current = term
    return () => {
      observer.disconnect()
      // ⚠️ 一定要 dispose：Terminal 挂了事件监听、定时器和一堆 DOM，
      //    不释放的话每切一次标签就泄漏一个终端
      term.dispose()
      termRef.current = null
    }
  }, [])

  // ② 跟随页面的明暗主题。改 options 就行，不用重建终端
  useEffect(() => {
    if (termRef.current) termRef.current.options.theme = THEMES[resolved]
  }, [resolved])

  // ③ 显示哪条命令：先把已有的输出重放一遍，再订阅后续的新输出
  useEffect(() => {
    const term = termRef.current
    if (!term) return

    term.reset()
    if (!toolUseId) {
      term.write('\x1b[2m还没有运行过命令。让代码助手"跑一下测试"试试。\x1b[22m')
      return
    }
    for (const chunk of readOutput(toolUseId)) term.write(chunk.text)
    // subscribeOutput 返回取消订阅的函数，直接当清理函数：切换命令或卸载时自动退订
    return subscribeOutput(toolUseId, (chunk) => term.write(chunk.text))
  }, [toolUseId])

  return <div ref={hostRef} className="h-full w-full" aria-label="命令输出" />
}
