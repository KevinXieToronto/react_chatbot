/**
 * SSE 相关的小工具。原来都写在 routes/chat.js 里，
 * 现在任务 Mock、代码 Mock、工具执行器都要用，就挪到一个公共文件。
 */

/** 发一条 SSE 消息。注意结尾必须是两个换行。 */
export function sse(res, event, data) {
  // 客户端已经断开时 write 没有意义（还可能报 ERR_STREAM_DESTROYED）
  if (res.writableEnded || res.destroyed) return
  res.write(`event: ${event}\n`)
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

/** 设置 SSE 必需的响应头 */
export function openStream(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // 关键：告诉 Nginx 之类的反向代理不要缓冲这个响应。
    // 不加这行，生产环境会出现"本地流式正常，上线后变成一次性返回"。
    'X-Accel-Buffering': 'no',
  })
  // 立刻把响应头发出去，别等第一个数据块
  res.flushHeaders?.()
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/** 把一段文字一个字一个字地推出去（Mock 模式模拟模型输出） */
export async function typeOut(res, text, signal) {
  let i = 0
  while (i < text.length) {
    if (signal.aborted || res.writableEnded || res.destroyed) return false
    const size = 1 + Math.floor(Math.random() * 3)
    sse(res, 'delta', { text: text.slice(i, i + size) })
    i += size
    await sleep(22)
  }
  return true
}
