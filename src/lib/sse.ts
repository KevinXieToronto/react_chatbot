/** 后端推过来的一条事件 */
export interface SSEEvent {
  event: string
  data: unknown
}

/**
 * 把 fetch 返回的字节流解析成 SSE 事件。
 * 用异步生成器（async generator），调用方可以直接 for await。
 *
 * 为什么不用 EventSource：它只能 GET、不能带自定义头、断线会自动重发整个请求。
 */
export async function* parseSSE(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<SSEEvent> {
  const reader = body.getReader()

  // TextDecoder 的 stream: true 很关键：
  // 一个 UTF-8 中文字符占 3 字节，可能被切在两个网络块中间。
  // 不开 stream 模式会解出乱码（比如 "你" 变成 "�"）。
  const decoder = new TextDecoder('utf-8')

  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (signal?.aborted) break

      buffer += decoder.decode(value, { stream: true })

      // SSE 用空行分隔消息。
      // 兼容 \n\n 和 \r\n\r\n（有些代理会改换行符）
      let boundary: number
      while ((boundary = findBoundary(buffer)) !== -1) {
        const raw = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary).replace(/^(\r?\n){2}/, '')

        const parsed = parseBlock(raw)
        if (parsed) yield parsed
      }
    }
  } finally {
    // 调用方可能提前不读了（for await 里 return / break 了，或者上面 signal 触发了 break），
    // 这时流还开着。cancel() 才会真正关掉底层连接；releaseLock() 只是"松开锁"，连接照样开着。
    // 流已经正常结束或已经出错时，cancel() 什么也不做（出错时它会 reject，吞掉即可）
    await reader.cancel().catch(() => {})
  }
}

function findBoundary(buffer: string): number {
  const i = buffer.indexOf('\n\n')
  const j = buffer.indexOf('\r\n\r\n')
  if (i === -1) return j
  if (j === -1) return i
  return Math.min(i, j)
}

function parseBlock(raw: string): SSEEvent | null {
  let event = 'message'
  const dataLines: string[] = []

  for (const line of raw.split(/\r?\n/)) {
    // 以冒号开头的是注释（常用作心跳），忽略
    if (line.startsWith(':')) continue

    const colon = line.indexOf(':')
    if (colon === -1) continue

    const field = line.slice(0, colon)
    // 规范规定冒号后如果有一个空格要去掉
    const value = line.slice(colon + 1).replace(/^ /, '')

    if (field === 'event') event = value
    else if (field === 'data') dataLines.push(value)
  }

  if (dataLines.length === 0) return null

  const dataText = dataLines.join('\n')
  try {
    return { event, data: JSON.parse(dataText) }
  } catch {
    // 后端发了非 JSON 的 data，原样返回字符串
    return { event, data: dataText }
  }
}
