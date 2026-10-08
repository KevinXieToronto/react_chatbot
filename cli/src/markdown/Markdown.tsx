import type { ReactNode } from 'react'
import { Box, Text } from 'ink'
import type { MarkedToken, Token, Tokens } from 'marked'
import stringWidth from 'string-width'
import { highlightLines } from './highlight'

// ── 行内：粗体、斜体、行内代码、链接…… ──────────────────────────
// 它们都画成嵌套的 <Text>。Ink 的规矩：<Text> 里只能放文字和 <Text>

function Inline({ tokens }: { tokens: Token[] | undefined }) {
  return <>{(tokens ?? []).map((t, i) => renderInline(t as MarkedToken, i))}</>
}

function renderInline(t: MarkedToken, key: number): ReactNode {
  switch (t.type) {
    case 'text':
      // 列表项里的 text 还会再套一层行内 token
      return t.tokens ? <Inline key={key} tokens={t.tokens} /> : <Text key={key}>{t.text}</Text>
    case 'strong':
      return (
        <Text key={key} bold>
          <Inline tokens={t.tokens} />
        </Text>
      )
    case 'em':
      return (
        <Text key={key} italic>
          <Inline tokens={t.tokens} />
        </Text>
      )
    case 'del':
      return (
        <Text key={key} strikethrough>
          <Inline tokens={t.tokens} />
        </Text>
      )
    case 'codespan':
      return (
        <Text key={key} color="yellow">
          {t.text}
        </Text>
      )
    case 'link':
      // 终端里点不了链接，把地址也印出来（文字和地址一样时只印一次）
      return (
        <Text key={key}>
          <Text color="blue" underline>
            <Inline tokens={t.tokens} />
          </Text>
          {t.text !== t.href && <Text dimColor> ({t.href})</Text>}
        </Text>
      )
    case 'image':
      return (
        <Text key={key} dimColor>
          [图片：{t.text || t.href}]
        </Text>
      )
    case 'br':
      return <Text key={key}>{'\n'}</Text>
    case 'escape':
      return <Text key={key}>{t.text}</Text>
    case 'html':
      // 不解释 HTML，原样显示成暗色（这里本来就没有 DOM，谈不上 XSS，但也不该假装它是格式）
      return (
        <Text key={key} dimColor>
          {t.raw}
        </Text>
      )
    default:
      return <Text key={key}>{t.raw}</Text>
  }
}

/** 行内 token 最终会印出来的纯文字 —— 表格要用它算列宽，必须和上面的画法一致 */
function inlineText(tokens: Token[] | undefined): string {
  return (tokens ?? [])
    .map((token) => {
      const t = token as MarkedToken
      switch (t.type) {
        case 'text':
          return t.tokens ? inlineText(t.tokens) : t.text
        case 'strong':
        case 'em':
        case 'del':
          return inlineText(t.tokens)
        case 'codespan':
        case 'escape':
          return t.text
        case 'link':
          return inlineText(t.tokens) + (t.text !== t.href ? ` (${t.href})` : '')
        case 'image':
          return `[图片：${t.text || t.href}]`
        case 'br':
          return '\n'
        default:
          return t.raw
      }
    })
    .join('')
}

// ── 代码块 ─────────────────────────────────────────────

interface CodeBlockProps {
  code: string
  lang?: string
  /** 只显示最后几行（正在输出时用，见第四节） */
  maxLines?: number
}

/**
 * 代码块：第一行是暗色的语言名，下面是高亮过的代码。
 * 故意不画边框 —— 用户会用鼠标选中复制代码，边框字符 │ 会跟着被复制进去。
 */
export function CodeBlock({ code, lang, maxLines }: CodeBlockProps) {
  const lines = highlightLines(code, lang)
  const shown = maxLines !== undefined && lines.length > maxLines ? lines.slice(-maxLines) : lines
  const hidden = lines.length - shown.length

  return (
    <Box flexDirection="column">
      <Text dimColor>
        {lang?.trim() || 'text'}
        {hidden > 0 && ` · 上面还有 ${hidden} 行，输出完后显示全部`}
      </Text>
      {shown.map((segments, i) => (
        <Text key={i}>
          {segments.length === 0
            ? ' '
            : segments.map((s, j) => (
                <Text key={j} color={s.color} dimColor={s.dim}>
                  {s.text}
                </Text>
              ))}
        </Text>
      ))}
    </Box>
  )
}

// ── 表格 ──────────────────────────────────────────────

function pad(text: string, width: number, align: Tokens.TableCell['align']) {
  const space = Math.max(0, width - stringWidth(text))
  if (align === 'right') return [' '.repeat(space), '']
  if (align === 'center') return [' '.repeat(Math.floor(space / 2)), ' '.repeat(Math.ceil(space / 2))]
  return ['', ' '.repeat(space)]
}

/**
 * 表格。列宽按"显示宽度"算：一个汉字占 2 列，'标题'.length 是 2，stringWidth('标题') 是 4。
 * 用 .length 算的话，中文表格的竖线会对不齐。
 * 放不下（比终端还宽）时，退回成"一行一条记录"的竖排格式，而不是让 Ink 把每行折成两半。
 */
function Table({ table, width }: { table: Tokens.Table; width: number }) {
  const header = table.header.map((c) => inlineText(c.tokens))
  const rows = table.rows.map((r) => r.map((c) => inlineText(c.tokens)))
  const widths = header.map((h, c) => Math.max(stringWidth(h), ...rows.map((r) => stringWidth(r[c] ?? ''))))
  // 每列左右各 1 个空格 + 竖线
  const total = widths.reduce((a, b) => a + b, 0) + widths.length * 3 + 1

  if (total > width || header.some((h) => h.includes('\n'))) {
    return (
      <Box flexDirection="column" gap={1}>
        {table.rows.map((row, r) => (
          <Box key={r} flexDirection="column">
            {row.map((cell, c) => (
              <Text key={c}>
                <Text bold>{header[c]}：</Text>
                <Inline tokens={cell.tokens} />
              </Text>
            ))}
          </Box>
        ))}
      </Box>
    )
  }

  const line = (l: string, m: string, r: string) =>
    l + widths.map((w) => '─'.repeat(w + 2)).join(m) + r

  const renderRow = (cells: Tokens.TableCell[], texts: string[], bold: boolean) => (
    <Text>
      <Text dimColor>│</Text>
      {cells.map((cell, c) => {
        const [before, after] = pad(texts[c] ?? '', widths[c], table.align[c])
        return (
          <Text key={c}>
            {' ' + before}
            <Text bold={bold}>
              <Inline tokens={cell.tokens} />
            </Text>
            {after + ' '}
            <Text dimColor>│</Text>
          </Text>
        )
      })}
    </Text>
  )

  return (
    <Box flexDirection="column">
      <Text dimColor>{line('┌', '┬', '┐')}</Text>
      {renderRow(table.header, header, true)}
      <Text dimColor>{line('├', '┼', '┤')}</Text>
      {table.rows.map((row, r) => (
        <Box key={r}>{renderRow(row, rows[r], false)}</Box>
      ))}
      <Text dimColor>{line('└', '┴', '┘')}</Text>
    </Box>
  )
}

// ── 列表 ──────────────────────────────────────────────

const BULLETS = ['•', '◦', '▪']

function List({ list, width, depth }: { list: Tokens.List; width: number; depth: number }) {
  const start = Number(list.start) || 1
  const markers = list.items.map((item, i) => {
    if (item.task) return item.checked ? '☒' : '☐'
    return list.ordered ? `${start + i}.` : BULLETS[depth % BULLETS.length]
  })
  // 有序列表 9. 和 10. 宽度不同，统一右对齐
  const markerWidth = Math.max(...markers.map((m) => stringWidth(m)))

  return (
    <Box flexDirection="column">
      {list.items.map((item, i) => (
        <Box key={i}>
          <Box flexShrink={0}>
            <Text color={item.task && item.checked ? 'green' : undefined}>
              {markers[i].padStart(markerWidth)}{' '}
            </Text>
          </Box>
          <Box flexDirection="column" width={width - markerWidth - 1} gap={item.loose ? 1 : 0}>
            {item.tokens
              .filter((t) => t.type !== 'checkbox' && t.type !== 'space')
              .map((t, j) =>
                t.type === 'list' ? (
                  <List key={j} list={t as Tokens.List} width={width - markerWidth - 1} depth={depth + 1} />
                ) : (
                  <MarkdownBlock key={j} token={t} width={width - markerWidth - 1} />
                ),
              )}
          </Box>
        </Box>
      ))}
    </Box>
  )
}

// ── 块 ───────────────────────────────────────────────

interface MarkdownBlockProps {
  token: Token
  /** 这一块能用的宽度（列数）：分隔线、表格要用 */
  width: number
  /** 代码块只显示最后几行（只有正在输出的那一块才传） */
  maxCodeLines?: number
}

/** 画一个块级 token。一条回复 = 若干个块 */
export function MarkdownBlock({ token, width, maxCodeLines }: MarkdownBlockProps) {
  const t = token as MarkedToken
  switch (t.type) {
    case 'heading':
      return (
        <Text bold color={t.depth <= 2 ? 'cyan' : undefined} underline={t.depth === 1}>
          <Inline tokens={t.tokens} />
        </Text>
      )
    case 'paragraph':
    case 'text':
      return (
        <Text>
          <Inline tokens={t.tokens ?? [t]} />
        </Text>
      )
    case 'list':
      return <List list={t} width={width} depth={0} />
    case 'code':
      return <CodeBlock code={t.text} lang={t.lang} maxLines={maxCodeLines} />
    case 'blockquote':
      return (
        <Box
          flexDirection="column"
          gap={1}
          borderStyle="bold"
          borderColor="gray"
          borderTop={false}
          borderRight={false}
          borderBottom={false}
          paddingLeft={1}
        >
          {t.tokens.map((child, i) => (
            <MarkdownBlock key={i} token={child} width={width - 2} />
          ))}
        </Box>
      )
    case 'table':
      return <Table table={t} width={width} />
    case 'hr':
      return <Text dimColor>{'─'.repeat(Math.max(1, width))}</Text>
    case 'html':
      return <Text dimColor>{t.raw.trimEnd()}</Text>
    case 'space':
    case 'def':
      return null
    default:
      return <Text>{t.raw.trimEnd()}</Text>
  }
}
