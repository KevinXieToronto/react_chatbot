import { describe, expect, it } from 'vitest'
import { render } from 'ink-testing-library'
import { Box } from 'ink'
import { lexer } from 'marked'
import stringWidth from 'string-width'
import { MarkdownBlock } from './Markdown'
import { splitBlocks } from './blocks'

/** 把一段 Markdown 画出来，返回纯文本（测试环境里没有颜色码） */
function draw(md: string, width = 80): string {
  const tokens = lexer(md).filter((t) => t.type !== 'space')
  const { lastFrame } = render(
    <Box flexDirection="column">
      {tokens.map((t, i) => (
        <MarkdownBlock key={i} token={t} width={width} />
      ))}
    </Box>,
  )
  return lastFrame() ?? ''
}

describe('MarkdownBlock', () => {
  it('行内格式：标记符号不见了，只剩文字；链接把地址也印出来', () => {
    const out = draw('这是 **粗体**、`code` 和 [链接](https://a.b)')
    expect(out).toContain('这是 粗体、code 和 链接 (https://a.b)')
    expect(out).not.toContain('**')
  })

  it('列表：有序、嵌套、任务', () => {
    const out = draw('1. 一\n2. 二\n   - 嵌套\n\n- [x] 完成\n- [ ] 待办')
    expect(out).toContain('1. 一')
    expect(out).toContain('2. 二')
    expect(out).toContain('   ◦ 嵌套')
    expect(out).toContain('☒ 完成')
    expect(out).toContain('☐ 待办')
  })

  it('代码块：先印语言名，代码原样保留缩进', () => {
    const out = draw('```ts\nfunction f() {\n  return 1\n}\n```')
    expect(out).toContain('ts\nfunction f() {\n  return 1\n}')
  })

  it('表格：按显示宽度对齐，中文不会把竖线挤歪', () => {
    const out = draw('| 标题 | 优先级 |\n| --- | --- |\n| 修复登录页 | `high` |\n| 写文档 | low |')
    const lines = out.split('\n')
    // 每一行的显示宽度都一样（一个汉字占 2 列）
    expect(new Set(lines.map((l) => stringWidth(l))).size).toBe(1)
    expect(out).toContain('│ 修复登录页 │ high   │')
  })

  it('表格太宽放不下：退回成一条记录一段', () => {
    const out = draw('| 标题 | 优先级 |\n| --- | --- |\n| 修复登录页 | high |', 12)
    expect(out).toContain('标题：修复登录页')
    expect(out).toContain('优先级：high')
    expect(out).not.toContain('│')
  })

  it('正在输出的长代码块只显示最后几行，并提示上面还有多少', () => {
    const code = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join('\n')
    const [token] = lexer('```\n' + code + '\n```')
    const { lastFrame } = render(<MarkdownBlock token={token} width={80} maxCodeLines={5} />)
    const out = lastFrame() ?? ''
    expect(out).toContain('上面还有 25 行')
    expect(out).toContain('line 26')
    expect(out).toContain('line 30')
    expect(out).not.toContain('line 25')
  })
})

describe('splitBlocks', () => {
  it('最后一块还没写完；写完的块的长度正好对应原文', () => {
    const text = '# 标题\n\n第一段\n\n第二段还在'
    const { finished, length, open } = splitBlocks(text, false)
    expect(finished.map((t) => t.type)).toEqual(['heading', 'paragraph'])
    expect(text.slice(length)).toBe('第二段还在')
    expect(open.map((t) => t.type)).toEqual(['paragraph'])
  })

  it('没闭合的代码块算"还在写"；closed = true 时全部定稿', () => {
    expect(splitBlocks('```ts\nconst a = 1\n', false).finished).toEqual([])
    expect(splitBlocks('```ts\nconst a = 1\n', true).finished.map((t) => t.type)).toEqual(['code'])
  })

  it('一个字一个字地喂进去：提前定稿的块和最终全文里的对应块一模一样（进了 <Static> 不用再改）', () => {
    const text =
      '你有 **2** 条任务：\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n' +
      '1. 第一步\n2. 第二步\n   - 嵌套\n   - 再嵌套\n3. 第三步\n\n> 引用\n\n```js\nx\n```\n结尾'
    const full = lexer(text).filter((t) => t.type !== 'space')
    for (let i = 1; i <= text.length; i++) {
      const { finished } = splitBlocks(text.slice(0, i), false)
      finished.forEach((t, k) => {
        expect(t.type).toBe(full[k].type)
        expect(t.raw.trimEnd()).toBe(full[k].raw.trimEnd())
      })
    }
  })
})
