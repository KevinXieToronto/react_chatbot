/**
 * 补全流式输出中未闭合的 Markdown 结构。
 *
 * 流式到一半时内容可能是 "你有 **3" —— 粗体没闭合，解析器只能把 ** 当文字显示，
 * 等闭合的 ** 到了才突然变粗。临时补上闭合标记，格式从第一帧起就是对的。
 */
export function completeMarkdown(text: string): string {
  let result = text

  // 1. 未闭合的代码块（``` 数量为奇数）
  //    此刻我们正处在代码块【里面】：块里的 ` 和 ** 都是普通字符（比如 Python 的 **kwargs），
  //    不能当成 Markdown 标记去补。闭合代码块就够了，直接返回。
  //    （要是在后面再补一个 **，就会变成一行 "```**" —— 那不是合法的闭合围栏，代码块还是没关上）
  const fenceCount = (result.match(/```/g) ?? []).length
  if (fenceCount % 2 === 1) {
    return result + '\n```'
  }

  // 下面只看代码块【外面】的内容：先把成对的 ``` 代码块整个去掉
  let outsideFences = result.replace(/```[\s\S]*?```/g, '')

  // 2. 未闭合的行内代码（单个 ` 的数量为奇数）
  const inlineTicks = (outsideFences.match(/`/g) ?? []).length
  if (inlineTicks % 2 === 1) {
    result += '`'
    outsideFences += '`'
  }

  // 3. 未闭合的粗体。行内代码 `a ** b` 里的星号也不算，先去掉行内代码再数
  const outsideCode = outsideFences.replace(/`[^`]*`/g, '')
  const bold = (outsideCode.match(/\*\*/g) ?? []).length
  if (bold % 2 === 1) {
    result += '**'
  }

  return result
}

/**
 * 把 Markdown 按段落切块，用于分块渲染。
 *
 * 为什么按空行切：Markdown 的段落分隔就是空行，
 * 在空行处切开不会破坏任何结构（代码块内部的空行除外，所以要特殊处理）。
 */
export function splitBlocks(text: string): string[] {
  const blocks: string[] = []
  const lines = text.split('\n')

  let current: string[] = []
  let inFence = false

  for (const line of lines) {
    if (line.trimStart().startsWith('```')) {
      inFence = !inFence
    }

    // 代码块【外面】的空行才是分隔符
    if (!inFence && line.trim() === '' && current.length > 0) {
      blocks.push(current.join('\n'))
      current = []
      continue
    }

    current.push(line)
  }

  if (current.length > 0) {
    blocks.push(current.join('\n'))
  }

  return blocks.filter((b) => b.trim() !== '')
}
