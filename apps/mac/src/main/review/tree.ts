import type { FileChangeKind, ReviewTreeNode } from './types.js'

interface MutableTreeNode extends ReviewTreeNode {
  children?: MutableTreeNode[]
}

export function buildFileTree(
  paths: Array<{ path: string; change?: FileChangeKind; previousPath?: string }>,
  prefix = 'tree'
): ReviewTreeNode[] {
  const root: MutableTreeNode[] = []
  for (const entry of paths) {
    const parts = entry.path.split('/').filter(Boolean)
    let level = root
    let current = ''
    parts.forEach((part, index) => {
      current = current ? `${current}/${part}` : part
      const directory = index < parts.length - 1
      let node = level.find((candidate) => candidate.name === part && candidate.kind === (directory ? 'directory' : 'file'))
      if (!node) {
        node = {
          id: `${prefix}:${current}`,
          name: part,
          path: current,
          kind: directory ? 'directory' : 'file',
          change: directory ? undefined : entry.change,
          previousPath: directory ? undefined : entry.previousPath,
          children: directory ? [] : undefined
        }
        level.push(node)
      }
      if (directory) level = node.children ?? []
    })
  }
  const sort = (nodes: MutableTreeNode[]): ReviewTreeNode[] =>
    nodes
      .sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      .map((node) => ({ ...node, children: node.children ? sort(node.children) : undefined }))
  return sort(root)
}

