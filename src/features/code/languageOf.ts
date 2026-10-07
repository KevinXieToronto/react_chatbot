/**
 * 按扩展名猜 Monaco 的语言 id（第 32 章）。
 *
 * 只列了 MonacoViewer 里注册过语法高亮的语言；认不出的一律 plaintext ——
 * 宁可不高亮，也别用错的规则把代码染得乱七八糟。
 */
const BY_EXTENSION: Record<string, string> = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  // JSON 没有单独的语法高亮定义（完整的 JSON 支持要带一个 worker），借用 JavaScript 的就够看了
  json: 'javascript',
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'typescript',
  css: 'css',
  html: 'html',
  htm: 'html',
  md: 'markdown',
  yml: 'yaml',
  yaml: 'yaml',
  sh: 'shell',
  bat: 'bat',
  cmd: 'bat',
}

export function languageOf(path: string): string {
  const name = path.split('/').pop() ?? ''
  const dot = name.lastIndexOf('.')
  // 没有扩展名，或者是 .gitignore 这种"只有扩展名"的文件
  if (dot <= 0) return 'plaintext'
  return BY_EXTENSION[name.slice(dot + 1).toLowerCase()] ?? 'plaintext'
}
