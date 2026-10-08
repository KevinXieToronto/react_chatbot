import { useEffect, useState } from 'react'
import { render, Box, Static, Text, useApp, useWindowSize } from 'ink'
import { splitBlocks } from '../markdown/blocks'
import { MarkdownBlock } from '../markdown/Markdown'

const DOC = `# 终端里的 Markdown

这是一段**粗体**、*斜体*、~~删除线~~和 \`行内代码\` 混排的文字，还有一个[链接](https://github.com/vadimdemedes/ink)。

## 列表

1. 第一步：装依赖
2. 第二步：写组件
   - 嵌套的无序列表
   - 中文和 English 混排
3. 第三步：跑起来

- [x] 已完成的任务
- [ ] 没完成的任务

## 代码

\`\`\`tsx
function Hello({ name }: { name: string }) {
  // 注释是暗色的
  return <Text color="green">你好，{name}！</Text>
}
\`\`\`

## 表格

| 章节 | 主题 | 状态 |
| --- | :---: | ---: |
| 35 | Ink 基础 | 完成 |
| 36 | 共享核心 | 完成 |
| 37 | 流式渲染 | 进行中 |

> 引用块：写完的块进入 Static，只有正在写的这一块在动态区里重画。

---

完。`

/** 模拟流式输出：每 20ms 多吐 3 个字符 */
function Demo() {
  const { exit } = useApp()
  const { columns } = useWindowSize()
  const [length, setLength] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => setLength((n) => Math.min(DOC.length, n + 3)), 20)
    return () => clearInterval(timer)
  }, [])

  const closed = length >= DOC.length
  useEffect(() => {
    if (closed) exit()
  }, [closed, exit])

  // 写完的块交给 <Static>（只画一次），还在写的块在动态区里每次重画
  const { finished, open } = splitBlocks(DOC.slice(0, length), closed)

  return (
    <Box flexDirection="column">
      <Static items={finished.map((token, i) => ({ id: i, token }))}>
        {(block) => (
          <Box key={block.id} marginBottom={1}>
            <MarkdownBlock token={block.token} width={columns} />
          </Box>
        )}
      </Static>
      {open.map((token, i) => (
        <Box key={i} marginBottom={1}>
          <MarkdownBlock token={token} width={columns} />
        </Box>
      ))}
      <Text dimColor>
        {closed ? '输出完毕' : `已输出 ${length} / ${DOC.length} 个字符`} · 已定稿 {finished.length} 块
      </Text>
    </Box>
  )
}

render(<Demo />)
