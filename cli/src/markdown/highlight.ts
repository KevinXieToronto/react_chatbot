import { common, createLowlight } from 'lowlight'

// common = highlight.js 里最常用的 37 种语言（js/ts/tsx/json/css/bash/python…），够用了
const lowlight = createLowlight(common)

type Root = ReturnType<typeof lowlight.highlight>
type HastNode = Root['children'][number]

/** 一小段同样颜色的文字 */
export interface Segment {
  text: string
  color?: string
  dim?: boolean
}

type Style = Pick<Segment, 'color' | 'dim'>

/**
 * highlight.js 的 class → 终端颜色。只用 16 色里的名字：
 * 用户的终端主题会把它们映射成协调的颜色，比写死 #rrggbb 更不容易"亮底看不清"
 */
const STYLES: Record<string, Style> = {
  'hljs-keyword': { color: 'magenta' },
  'hljs-built_in': { color: 'cyan' },
  'hljs-type': { color: 'cyan' },
  'hljs-literal': { color: 'yellow' },
  'hljs-number': { color: 'yellow' },
  'hljs-string': { color: 'green' },
  'hljs-regexp': { color: 'green' },
  'hljs-comment': { dim: true },
  'hljs-meta': { dim: true },
  'hljs-title': { color: 'blue' },
  'hljs-section': { color: 'blue' },
  'hljs-attr': { color: 'yellow' },
  'hljs-attribute': { color: 'yellow' },
  'hljs-property': { color: 'yellow' },
  'hljs-name': { color: 'red' },
  'hljs-variable': { color: 'red' },
  'hljs-symbol': { color: 'yellow' },
  'hljs-addition': { color: 'green' },
  'hljs-deletion': { color: 'red' },
}

function flatten(nodes: HastNode[], style: Style, out: Segment[]) {
  for (const node of nodes) {
    if (node.type === 'text') {
      out.push({ text: node.value, ...style })
    } else if (node.type === 'element') {
      const classes = (node.properties.className ?? []) as string[]
      // 嵌套的 span 继承外层颜色，自己有颜色就覆盖
      const own = classes.map((c) => STYLES[c]).find(Boolean)
      flatten(node.children, { ...style, ...own }, out)
    }
  }
}

/**
 * 高亮一段代码，按行返回。
 * 按行是为了两件事：每行一个 <Text>，长行在终端里各自折行；正在输出时可以只显示最后几行。
 * 不认识的语言（或者没写语言）就不上色。
 */
export function highlightLines(code: string, lang?: string): Segment[][] {
  const text = code.replace(/\n$/, '')
  const name = lang?.trim().split(/\s+/)[0]?.toLowerCase()

  let segments: Segment[] = [{ text }]
  if (name && lowlight.registered(name)) {
    try {
      const out: Segment[] = []
      flatten(lowlight.highlight(name, text).children, {}, out)
      segments = out
    } catch {
      /* 高亮失败就退回纯文本，别让一段代码把界面搞崩 */
    }
  }

  const lines: Segment[][] = [[]]
  for (const seg of segments) {
    seg.text.split('\n').forEach((part, i) => {
      if (i > 0) lines.push([])
      if (part) lines[lines.length - 1].push({ ...seg, text: part })
    })
  }
  return lines
}
