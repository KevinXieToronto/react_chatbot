/** 每个工具最多留多少字符的输出。终端里只显示最后几行，不需要全部（完整输出模型那边有） */
const MAX_CHARS = 16_000

/** 追加一块命令输出（第 32 章的 tool_output），只保留最后 MAX_CHARS 个字符 */
export function appendOutput(buffer: string, chunk: string): string {
  const next = buffer + chunk
  return next.length > MAX_CHARS ? next.slice(next.length - MAX_CHARS) : next
}

/**
 * 取最后 n 行，按终端的规矩处理回车符：
 * 进度条用 "\r" 回到行首重写同一行（第 32 章），真正的终端里只看得见最后一次写的内容。
 * 颜色代码（SGR）原样保留，Ink 会正确地画出来；光标移动之类的控制序列 Ink 会自己过滤掉。
 */
export function tailLines(buffer: string, n: number): string[] {
  const lines = buffer.replace(/\r\n/g, '\n').split('\n')
  // 以换行结尾时，split 出来最后一项是空串，不算一行
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines.slice(-n).map((line) => {
    const parts = line.split('\r').filter((p) => p !== '')
    return parts.length > 0 ? parts[parts.length - 1] : ''
  })
}
