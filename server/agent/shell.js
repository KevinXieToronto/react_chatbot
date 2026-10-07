import { spawn } from 'node:child_process'

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
 * 返回 { exitCode, output, timedOut, aborted, overflow }，命令本身失败（退出码非 0）
 * 不算异常 —— 那是正常结果，交给调用方判断。
 */
export function runShell(command, { cwd, timeoutMs = 30_000, maxOutput = 20_000, signal } = {}) {
  return new Promise((resolve, reject) => {
    // 子进程默认继承服务端的全部环境变量 —— 包括 ANTHROPIC_API_KEY 和 TASKFLOW_TOKEN。
    // 一条 `set` 命令就能把它们打印出来，所以只给白名单里的那些
    const env = childEnv({ NO_COLOR: '1', FORCE_COLOR: '0' })

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

    const chunks = []
    let bytes = 0
    let timedOut = false
    let aborted = false
    let overflow = false

    function onData(buf) {
      bytes += buf.length
      if (bytes <= HARD_CAP_BYTES) {
        chunks.push(buf)
      } else if (!overflow) {
        overflow = true
        killTree(child)
      }
    }
    // stdout 和 stderr 合在一起，按到达顺序记录，和你在终端里看到的一致
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)

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
      reject(err)
    })

    child.on('close', (code) => {
      cleanup()
      // ⚠️ 按 UTF-8 解码。node / npm / git 的输出都是 UTF-8，没问题；
      //    但 cmd 内置命令（dir、echo、type）按控制台代码页输出，
      //    中文 Windows 上是 GBK，中文会变乱码。见本章"Windows 细节"一节。
      const text = Buffer.concat(chunks).toString('utf8')
      resolve({
        exitCode: code,
        output: clipOutput(text, maxOutput),
        timedOut,
        aborted,
        overflow,
      })
    })
  })
}
