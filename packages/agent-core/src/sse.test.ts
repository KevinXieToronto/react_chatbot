import { describe, it, expect } from 'vitest'
import { parseSSE, type SSEEvent } from './sse'

/** 把几段字节做成一个 ReadableStream，模拟网络一块一块地到 */
function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(c)
      controller.close()
    },
  })
}

async function collect(body: ReadableStream<Uint8Array>): Promise<SSEEvent[]> {
  const out: SSEEvent[] = []
  for await (const evt of parseSSE(body)) out.push(evt)
  return out
}

const encode = (s: string) => new TextEncoder().encode(s)

describe('parseSSE', () => {
  it('解析 event + JSON data，空行分隔', async () => {
    const body = streamOf([encode('event: delta\ndata: {"text":"你好"}\n\nevent: done\ndata: {}\n\n')])
    expect(await collect(body)).toEqual([
      { event: 'delta', data: { text: '你好' } },
      { event: 'done', data: {} },
    ])
  })

  it('一个中文字符被切在两块中间，也不会乱码', async () => {
    const bytes = encode('event: delta\ndata: {"text":"你好"}\n\n')
    // "你" 占 3 个字节，从它中间切开
    const cut = bytes.indexOf(0xe4) + 1
    const body = streamOf([bytes.slice(0, cut), bytes.slice(cut)])
    expect(await collect(body)).toEqual([{ event: 'delta', data: { text: '你好' } }])
  })

  it('兼容 \r\n 换行，忽略以冒号开头的心跳注释', async () => {
    const body = streamOf([encode(': ping\r\n\r\nevent: delta\r\ndata: {"text":"a"}\r\n\r\n')])
    expect(await collect(body)).toEqual([{ event: 'delta', data: { text: 'a' } }])
  })
})
