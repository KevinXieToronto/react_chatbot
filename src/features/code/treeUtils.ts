/** 文件树的一个节点 */
export type TreeNode =
  | { type: 'dir'; name: string; path: string; children: TreeNode[] }
  | { type: 'file'; name: string; path: string; size: number }

/** 渲染用的"拍平"后的一行 */
export interface TreeRow {
  node: TreeNode
  depth: number
}

/**
 * 把后端给的扁平路径列表（src/math.js、README.md…）变成树。
 * 纯函数，方便单测。
 */
export function buildTree(files: { path: string; size: number }[]): TreeNode[] {
  const root: TreeNode[] = []

  for (const file of files) {
    const parts = file.path.split('/')
    let level = root

    parts.forEach((name, i) => {
      const path = parts.slice(0, i + 1).join('/')
      const isFile = i === parts.length - 1

      if (isFile) {
        level.push({ type: 'file', name, path, size: file.size })
        return
      }

      let dir = level.find((n): n is Extract<TreeNode, { type: 'dir' }> => n.type === 'dir' && n.name === name)
      if (!dir) {
        dir = { type: 'dir', name, path, children: [] }
        level.push(dir)
      }
      level = dir.children
    })
  }

  sortTree(root)
  return root
}

/** 目录在前、文件在后，同类按名字排序（原地排序） */
function sortTree(nodes: TreeNode[]) {
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  for (const n of nodes) if (n.type === 'dir') sortTree(n.children)
}

/** 把树拍平成带缩进深度的行；collapsed 里的目录不展开 */
export function flattenTree(nodes: TreeNode[], collapsed: ReadonlySet<string>, depth = 0): TreeRow[] {
  const rows: TreeRow[] = []
  for (const node of nodes) {
    rows.push({ node, depth })
    if (node.type === 'dir' && !collapsed.has(node.path)) {
      rows.push(...flattenTree(node.children, collapsed, depth + 1))
    }
  }
  return rows
}
