import { describe, expect, it } from 'vitest'
import { appendOutput, tailLines } from './outputTail'

describe('tailLines', () => {
  it('只取最后 n 行', () => {
    expect(tailLines('a\nb\nc\nd\n', 2)).toEqual(['c', 'd'])
  })

  it('进度条：\\r 回到行首重写，只留最后一次写的内容', () => {
    const out = '[3/4] 编译 [#.] 10%\r[3/4] 编译 [##] 20%\n完成\n'
    expect(tailLines(out, 5)).toEqual(['[3/4] 编译 [##] 20%', '完成'])
  })

  it('\\r\\n 被切在两块中间也没关系；还没换行的最后一行也显示出来', () => {
    let buf = appendOutput('', 'a\r')
    buf = appendOutput(buf, '\nb 进行中')
    expect(tailLines(buf, 5)).toEqual(['a', 'b 进行中'])
  })
})
