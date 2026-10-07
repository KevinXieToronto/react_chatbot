import { describe, it, expect } from 'vitest'
import { buildTree, flattenTree } from './treeUtils'

const files = [
  { path: 'README.md', size: 10 },
  { path: 'src/math.js', size: 20 },
  { path: 'src/utils/clamp.js', size: 5 },
  { path: 'package.json', size: 30 },
]

describe('buildTree', () => {
  it('目录在前、文件在后，并按名字排序', () => {
    const tree = buildTree(files)
    expect(tree.map((n) => n.name)).toEqual(['src', 'package.json', 'README.md'])
  })

  it('子目录嵌套正确', () => {
    const tree = buildTree(files)
    const src = tree[0]
    expect(src.type).toBe('dir')
    if (src.type !== 'dir') return
    expect(src.children.map((n) => n.path)).toEqual(['src/utils', 'src/math.js'])
  })
})

describe('flattenTree', () => {
  it('展开时带上缩进深度', () => {
    const rows = flattenTree(buildTree(files), new Set())
    expect(rows.map((r) => `${r.depth}:${r.node.name}`)).toEqual([
      '0:src',
      '1:utils',
      '2:clamp.js',
      '1:math.js',
      '0:package.json',
      '0:README.md',
    ])
  })

  it('折叠的目录不展开子项', () => {
    const rows = flattenTree(buildTree(files), new Set(['src']))
    expect(rows.map((r) => r.node.name)).toEqual(['src', 'package.json', 'README.md'])
  })
})
