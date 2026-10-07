import { execFileSync } from 'node:child_process'
import { stripVTControlCharacters } from 'node:util'

const isWindows = process.platform === 'win32'

/** Windows 代码页 → TextDecoder 认识的编码名（只列常见的几个） */
const CODE_PAGES = {
  936: 'gbk', // 简体中文
  54936: 'gb18030',
  950: 'big5', // 繁体中文
  932: 'shift_jis', // 日文
  949: 'euc-kr', // 韩文
  866: 'ibm866',
  1250: 'windows-1250',
  1251: 'windows-1251',
  1252: 'windows-1252',
}

let cachedEncoding

/**
 * 子进程的控制台用什么编码输出 cmd 内置命令（dir、echo、type…）。
 *
 * 做法：服务端启动后第一次用到时跑一次 `chcp`，解析出代码页。
 * 新起的子进程拿到的是【系统默认】代码页（中文 Windows 是 936），
 * 和你在自己的 cmd 窗口里 chcp 成什么无关。
 *
 * 返回 null 表示"全按 UTF-8 解码"：非 Windows、65001、或者 TextDecoder 不认识的代码页（比如英文系统的 437）。
 */
export function consoleEncoding() {
  if (cachedEncoding !== undefined) return cachedEncoding
  cachedEncoding = null
  if (isWindows) {
    try {
      // 输出是 "Active code page: 936" 或 "活动代码页: 936"（后者本身就是 GBK 编码的），
      // 按 latin1 读出来，只取最后那个数字，不管前面的文字是什么语言
      const out = execFileSync('cmd.exe', ['/d', '/c', 'chcp'], {
        encoding: 'latin1',
        windowsHide: true,
        timeout: 5000,
      })
      const cp = Number(out.match(/(\d+)\D*$/)?.[1])
      cachedEncoding = CODE_PAGES[cp] ?? null
    } catch {
      /* 读不到就按 UTF-8 */
    }
  }
  return cachedEncoding
}

/** 不带换行时最多攒多少字节再强制解码（防止一个不换行的进度条把内存吃光） */
const MAX_PARTIAL_BYTES = 4096

/**
 * 按行解码的解码器：每一行先按 UTF-8 严格解码，失败了再按控制台代码页（比如 GBK）解码。
 *
 * 为什么按行？同一条命令的输出可能混着两种编码：
 * `npm test` 里 node 打印的是 UTF-8，中间夹一行 cmd 内置命令的输出却是 GBK。
 * 一整段只能选一种编码，按行选就能各自解对。
 *
 * 为什么在 \n / \r 处切？这两个字节在 UTF-8 和 GBK 里都不会出现在多字节字符的中间，
 * 在这里切开绝不会把一个汉字切成两半（网络块、管道块却可能在任意位置切开）。
 */
export function createLineDecoder(fallbackEncoding = consoleEncoding()) {
  const strict = new TextDecoder('utf-8', { fatal: true })
  const lenient = new TextDecoder(fallbackEncoding ?? 'utf-8')
  let pending = Buffer.alloc(0)

  function decodeLine(bytes) {
    try {
      return strict.decode(bytes)
    } catch {
      return lenient.decode(bytes)
    }
  }

  function decodeAll(bytes) {
    let out = ''
    let start = 0
    for (let i = 0; i < bytes.length; i++) {
      if (bytes[i] === 0x0a) {
        out += decodeLine(bytes.subarray(start, i + 1))
        start = i + 1
      }
    }
    if (start < bytes.length) out += decodeLine(bytes.subarray(start))
    return out
  }

  /** 最后一个"切开也安全"的位置（在它后面切） */
  function safeCut(bytes) {
    const nl = Math.max(bytes.lastIndexOf(0x0a), bytes.lastIndexOf(0x0d))
    if (nl !== -1) return nl + 1
    if (bytes.length < MAX_PARTIAL_BYTES) return 0
    // 太长还不换行：退而求其次，在最后一个 < 0x40 的字节（空格、数字、标点）后面切。
    // UTF-8 的多字节字符每个字节都 ≥ 0x80，GBK 的第二个字节 ≥ 0x40，所以这里也切不坏汉字
    for (let i = bytes.length - 1; i >= 0; i--) if (bytes[i] < 0x40) return i + 1
    return bytes.length
  }

  return {
    /** 喂进一块原始字节，返回这次能确定的文本（可能是空串） */
    write(buf) {
      pending = pending.length > 0 ? Buffer.concat([pending, buf]) : buf
      const cut = safeCut(pending)
      if (cut === 0) return ''
      const text = decodeAll(pending.subarray(0, cut))
      pending = pending.subarray(cut)
      return text
    },
    /** 进程结束时调用：把剩下没换行的尾巴也解出来 */
    end() {
      const text = pending.length > 0 ? decodeAll(pending) : ''
      pending = Buffer.alloc(0)
      return text
    },
  }
}

/**
 * 节流：把一小块一小块的输出攒起来，最多每 intervalMs 推一次。
 *
 * `npm install` 这种命令一秒能写几百次管道，每次都发一条 SSE，
 * 浏览器就要处理几百个事件、xterm 就要重绘几百次。攒 50ms 再发，肉眼看还是实时的。
 *
 * - stdout / stderr 交替时先把前一种发出去，保证顺序和终端里看到的一致
 * - 攒够 maxChunk 就立刻发，不等定时器
 * - 推给浏览器的总量超过 maxTotal 就不再推（命令本身继续跑，给模型的结果另算）
 */
export function createOutputThrottle(
  emit,
  { intervalMs = 50, maxChunk = 8 * 1024, maxTotal = 512 * 1024 } = {},
) {
  let stream = null
  let buffer = ''
  let timer = null
  let sent = 0
  let muted = false

  function flush() {
    if (timer) clearTimeout(timer)
    timer = null
    if (!buffer) return
    emit(stream, buffer)
    sent += buffer.length
    buffer = ''
  }

  return {
    push(which, text) {
      if (!text || muted) return
      if (stream !== which) flush()
      stream = which

      if (sent + buffer.length + text.length > maxTotal) {
        buffer += text.slice(0, Math.max(0, maxTotal - sent - buffer.length))
        buffer += '\n…（输出太多，后面的不再实时显示）\n'
        muted = true
        flush()
        return
      }

      buffer += text
      if (buffer.length >= maxChunk) flush()
      else if (!timer) timer = setTimeout(flush, intervalMs)
    },
    /** 命令结束时调用，把最后一点发出去 */
    close() {
      flush()
    },
  }
}

/**
 * 给模型看的纯文本：
 * - 去掉 ANSI 转义序列（颜色、光标移动）—— 对模型毫无意义，还白白占 token
 * - 进度条用 \r 回到行首反复重写，只保留每行最后一次的样子
 */
export function toPlainText(text) {
  return stripVTControlCharacters(text)
    .split('\n')
    .map((line) => {
      // Windows 的换行是 \r\n，先去掉行尾那个 \r，剩下的 \r 才是"回到行首"
      const parts = line.replace(/\r$/, '').split('\r')
      return parts[parts.length - 1]
    })
    .join('\n')
}
