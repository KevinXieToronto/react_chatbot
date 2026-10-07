import { spawn } from 'node:child_process'
import { createLineDecoder, createOutputThrottle, toPlainText } from './terminalOutput.js'

const isWindows = process.platform === 'win32'

/** 最多在内存里攒多少字节的输出；超过就认为命令失控了，直接杀掉 */
const HARD_CAP_BYTES = 2 * 1024 * 1024

/**
 * 输出太长时只保留开头一小段和结尾一大段。
 * 测试、构建的关键信息（失败汇总、报错）几乎总在最后。
 */
export function clipOutput(text, max) {
  if (text.length <= max) return text
  const head = text.slice(0, Math.floor(max * 0.25))
  const tail = text.slice(-Math.floor(max * 0.75))
  const skipped = text.length - head.length - tail.length
  return `${head}\n…（中间省略 ${skipped} 个字符）…\n${tail}`
}

/**
 * 子进程能看到哪些环境变量：用【白名单】，不用黑名单。
 * 服务端的环境里有 ANTHROPIC_API_KEY、TASKFLOW_TOKEN，以后可能还有数据库密码……
 * 黑名单总有一天会漏掉一个；白名单只放行跑 node / npm / git 必需的那些。
 * （Windows 的环境变量名不区分大小写，所以按大写比较）
 */
const ENV_ALLOWLIST = new Set([
  // Windows
  'PATH', 'PATHEXT', 'COMSPEC', 'SYSTEMROOT', 'SYSTEMDRIVE', 'WINDIR', 'TEMP', 'TMP',
  'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA', 'PROGRAMDATA',
  'ALLUSERSPROFILE', 'PROGRAMFILES', 'PROGRAMFILES(X86)', 'COMMONPROGRAMFILES',
  'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'OS', 'USERNAME', 'COMPUTERNAME',
  // macOS / Linux
  'HOME', 'USER', 'SHELL', 'LANG', 'TERM', 'TMPDIR',
])

/** 按白名单复制一份环境变量，再叠加 extra */
export function childEnv(extra = {}) {
  const env = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (ENV_ALLOWLIST.has(key.toUpperCase())) env[key] = value
  }
  return { ...env, ...extra }
}

/** 杀掉整棵进程树 */
function killTree(child) {
  if (child.exitCode !== null || child.pid === undefined) return
  if (isWindows) {
    // ⚠️ Windows 上 child 是 cmd.exe，真正干活的 node / npm 是它的子进程。
    //    child.kill() 只杀 cmd.exe，孙子进程继续跑，管道不关，'close' 永远不来。
    //    taskkill /T 连同子进程一起杀，/F 强制。
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
  } else {
    // detached: true 让子进程自成一个进程组，负 pid 表示杀整组
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      /* 已经退出了 */
    }
  }
}

/**
 * 在 cwd 下用系统 shell 执行一条命令，收集输出。
 *
 * 第 32 章起多了 onOutput(stream, text)：命令还在跑的时候，
 * 解码好、节流过的输出就一块一块地交给调用方（再由它推给浏览器）。
 *
 * 返回 { exitCode, output, timedOut, aborted, overflow }，命令本身失败（退出码非 0）
 * 不算异常 —— 那是正常结果，交给调用方判断。output 是给模型看的纯文本。
 */
export function runShell(
  command,
  { cwd, timeoutMs = 30_000, maxOutput = 20_000, signal, onOutput, encoding } = {},
) {
  return new Promise((resolve, reject) => {
    // 子进程默认继承服务端的全部环境变量 —— 包括 ANTHROPIC_API_KEY 和 TASKFLOW_TOKEN。
    // 一条 `set` 命令就能把它们打印出来，所以只给白名单里的那些（第 30 章）。
    //
    // 第 32 章：输出进了真正的终端（xterm.js），颜色就有意义了。
    // 管道不是 TTY，大多数工具默认不输出颜色，FORCE_COLOR=1 让它们照样输出；
    // NO_COLOR 不在白名单里，自然也传不进去。
    // 给模型的那份结果会把颜色代码去掉（toPlainText）。
    const env = childEnv({ FORCE_COLOR: '1' })

    const child = spawn(command, {
      cwd,
      env,
      // shell: true → Windows 上是 cmd.exe /d /s /c "命令"，其他系统是 /bin/sh -c
      shell: true,
      // 不弹出黑色的控制台窗口
      windowsHide: true,
      // 不给 stdin：等待输入的命令（比如 pause、交互式提问）会立刻读到 EOF，而不是卡到超时
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: !isWindows,
    })

    // stdout、stderr 各用一个解码器：两条管道的字节块互不相干，不能混在一起解
    const decoders = {
      stdout: createLineDecoder(encoding),
      stderr: createLineDecoder(encoding),
    }
    const throttle = onOutput ? createOutputThrottle(onOutput) : null
    /** 按到达顺序记下解码后的文本，和你在终端里看到的一致 */
    const pieces = []

    let bytes = 0
    let timedOut = false
    let aborted = false
    let overflow = false

    function take(stream, text) {
      if (!text) return
      pieces.push(text)
      throttle?.push(stream, text)
    }

    function onData(stream, buf) {
      bytes += buf.length
      if (bytes <= HARD_CAP_BYTES) {
        take(stream, decoders[stream].write(buf))
      } else if (!overflow) {
        overflow = true
        killTree(child)
      }
    }
    child.stdout.on('data', (buf) => onData('stdout', buf))
    child.stderr.on('data', (buf) => onData('stderr', buf))

    const timer = setTimeout(() => {
      timedOut = true
      killTree(child)
    }, timeoutMs)

    function onAbort() {
      aborted = true
      killTree(child)
    }
    signal?.addEventListener('abort', onAbort, { once: true })

    function cleanup() {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }

    child.on('error', (err) => {
      cleanup()
      throttle?.close()
      reject(err)
    })

    child.on('close', (code) => {
      cleanup()
      // 最后一行可能没有换行，解码器里还攒着
      take('stdout', decoders.stdout.end())
      take('stderr', decoders.stderr.end())
      // 在 resolve 之前把最后一点输出推出去：保证浏览器先收到全部 tool_output，再收到 tool_end
      throttle?.close()

      resolve({
        exitCode: code,
        output: clipOutput(toPlainText(pieces.join('')), maxOutput),
        timedOut,
        aborted,
        overflow,
      })
    })
  })
}
