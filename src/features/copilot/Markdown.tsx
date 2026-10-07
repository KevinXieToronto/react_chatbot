import { isValidElement, memo } from 'react'
import type { ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import CodeBlock from './CodeBlock'
import { completeMarkdown, splitBlocks } from '../../lib/markdown'

/** 代码块里那个 <code> 元素身上我们要用的两个 props */
interface CodeProps {
  className?: string
  children?: ReactNode
}

/**
 * 自定义各个 Markdown 元素的渲染方式。
 * 定义在组件外面 —— 每次渲染都新建这个对象会让 ReactMarkdown 内部
 * 的优化全部失效。
 */
const components: Components = {
  /**
   * 代码块。Markdown 的代码块会变成 <pre><code class="language-xxx">…</code></pre>，
   * 行内代码只有 <code>，外面没有 <pre>。所以【有没有 pre】才是区分两者的可靠依据 ——
   * 看有没有 language-xxx 不行（```后面不写语言的代码块就没有），
   * 看内容里有没有换行也不行（只有一行的代码块就没有）。
   *
   * pre 的 children 就是里面那个 <code> 元素，从它的 props 里拿语言和代码文本，
   * 整块交给 CodeBlock 渲染。
   */
  pre({ children }) {
    const code: CodeProps = isValidElement<CodeProps>(children) ? children.props : {}
    const match = /language-(\w+)/.exec(code.className ?? '')
    const text = String(code.children ?? '').replace(/\n$/, '')
    return <CodeBlock language={match?.[1]} code={text} />
  },

  // 走到这里的 code 都是行内代码（代码块里的 code 已经被上面的 pre 接管了）
  // ⚠️ 别写 ...props 再展开到 <code> 上：react-markdown 会额外传一个 node（AST 节点对象），
  //    展开后会变成 DOM 上的 node="[object Object]" 属性
  code({ children }) {
    return (
      <code className="rounded bg-slate-200 px-1 py-0.5 font-mono text-[0.85em] text-rose-600 dark:bg-slate-700 dark:text-rose-300">
        {children}
      </code>
    )
  },

  // ⚠️ 链接必须加 rel="noopener noreferrer"。
  //    不加的话，被打开的页面能通过 window.opener 操作你的页面（钓鱼风险）。
  a({ href, children }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 underline underline-offset-2 hover:text-blue-700 dark:text-blue-400"
      >
        {children}
      </a>
    )
  },

  p({ children }) {
    return <p className="my-1.5 leading-relaxed first:mt-0 last:mb-0">{children}</p>
  },
  ul({ children }) {
    return <ul className="my-1.5 list-disc space-y-0.5 pl-5">{children}</ul>
  },
  ol({ children }) {
    return <ol className="my-1.5 list-decimal space-y-0.5 pl-5">{children}</ol>
  },
  h1({ children }) {
    return <h3 className="mb-1 mt-3 text-base font-bold first:mt-0">{children}</h3>
  },
  h2({ children }) {
    return <h3 className="mb-1 mt-3 text-sm font-bold first:mt-0">{children}</h3>
  },
  h3({ children }) {
    return <h4 className="mb-1 mt-2 text-sm font-semibold first:mt-0">{children}</h4>
  },
  blockquote({ children }) {
    return (
      <blockquote className="my-2 border-l-2 border-slate-300 pl-3 text-slate-500 dark:border-slate-600 dark:text-slate-400">
        {children}
      </blockquote>
    )
  },
  table({ children }) {
    return (
      <div className="my-2 overflow-x-auto">
        <table className="w-full border-collapse text-xs">{children}</table>
      </div>
    )
  },
  th({ children }) {
    return (
      <th className="border border-slate-200 bg-slate-50 px-2 py-1 text-left font-medium dark:border-slate-600 dark:bg-slate-700">
        {children}
      </th>
    )
  },
  td({ children }) {
    return <td className="border border-slate-200 px-2 py-1 dark:border-slate-600">{children}</td>
  },
  hr() {
    return <hr className="my-3 border-slate-200 dark:border-slate-600" />
  },
}

/** 模型输出里一律不渲染的元素。和 components 一样定义在组件外，保持引用稳定 */
const DISALLOWED = ['img']

/**
 * 单个 Markdown 块。
 *
 * memo 是这里的性能关键：流式输出时只有最后一块在变，
 * 前面的块 content 没变就完全跳过重新解析。
 */
const MarkdownBlock = memo(function MarkdownBlock({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={components}
      // 不渲染图片：<img> 一出现浏览器就会自动请求它的地址，
      // 被提示注入的模型可以借此把数据拼进 URL 发出去（见本章第二节）
      disallowedElements={DISALLOWED}
      // 注意：没有开 rehype-raw。
      // 开了就意味着允许原始 HTML，等同于 dangerouslySetInnerHTML 的风险，
      // 必须配 rehype-sanitize 才能用。模型输出不值得冒这个险。
    >
      {content}
    </ReactMarkdown>
  )
})

interface MarkdownProps {
  content: string
  /** 正在流式输出中 —— 需要补全未闭合的结构 */
  streaming?: boolean
}

const Markdown = memo(function Markdown({ content, streaming = false }: MarkdownProps) {
  // 流式中补全未闭合的代码块/粗体，避免解析结果突变导致闪烁
  const source = streaming ? completeMarkdown(content) : content
  const blocks = splitBlocks(source)

  return (
    <div className="text-sm">
      {blocks.map((block, i) => (
        // key 用索引在这里是【安全】的：块只会在末尾追加，
        // 不会重排序、不会从中间删除，且块内没有状态。
        // 这正是第 03 章说的"index 当 key 安全的三个条件"全部满足的情况。
        <MarkdownBlock key={i} content={block} />
      ))}
    </div>
  )
})

export default Markdown
