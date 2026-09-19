import type { FileChangeKind, ReviewChange, ReviewTreeNode } from '../../../preload/api/review.js'

interface MutableTreeNode extends ReviewTreeNode {
  children?: MutableTreeNode[]
}

/** Directory color describes changed descendants, including branches that are collapsed. */
export function treeChange(node: ReviewTreeNode): FileChangeKind | undefined {
  if (node.kind === 'file') return node.change
  const changes = new Set((node.children ?? []).map(treeChange).filter(Boolean).map(change =>
    change === 'added' || change === 'copied' || change === 'untracked' ? 'added'
      : change === 'deleted' ? 'deleted' : 'modified'
  ))
  return changes.size > 1 ? 'modified' : changes.values().next().value
}

/** Overlay the task diff on saved project listings, retaining deleted paths for review. */
export function projectReviewTree(tree: ReviewTreeNode[], changes: ReviewChange[]): ReviewTreeNode[] {
  const paths = new Map<string, { path: string; change?: FileChangeKind; previousPath?: string }>()
  const visit = (nodes: ReviewTreeNode[]): void => {
    for (const node of nodes) {
      if (node.kind === 'directory') visit(node.children ?? [])
      else paths.set(node.path, { path: node.path })
    }
  }
  visit(tree)
  for (const change of changes) paths.set(change.path, change)
  return buildFileTree([...paths.values()], 'project')
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
