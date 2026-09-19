import { expect, it } from 'vitest'
import { buildFileTree, projectReviewTree, treeChange } from '../src/renderer/src/model/reviewTree.js'

it('summarizes changed descendants even when clean siblings and nested directories are present', () => {
  const tree = buildFileTree([
    { path: 'src/new/a.ts', change: 'added' },
    { path: 'src/new/b.ts', change: 'untracked' },
    { path: 'src/new/c.ts', change: 'copied' },
    { path: 'src/new/clean.ts' },
    { path: 'src/gone/deep/a.ts', change: 'deleted' },
    { path: 'src/gone/b.ts', change: 'deleted' },
    { path: 'src/edit/a.ts', change: 'renamed', previousPath: 'src/edit/old.ts' },
    { path: 'clean/a.ts' }
  ])
  expect(treeChange(tree[0])).toBeUndefined()
  const src = tree[1]
  expect(treeChange(src)).toBe('modified')
  expect(src.children?.map(node => [node.name, treeChange(node)])).toEqual([
    ['edit', 'modified'], ['gone', 'deleted'], ['new', 'added']
  ])
})

it('overlays the task diff on a saved project tree without losing clean files or deleted directories', () => {
  const original = buildFileTree([{ path: 'src/keep.ts' }, { path: 'src/edit.ts' }])
  const tree = projectReviewTree(original, [
    { path: 'src/edit.ts', change: 'modified' },
    { path: 'src/new.ts', change: 'added' },
    { path: 'removed/deep/gone.ts', change: 'deleted' }
  ])
  expect(tree.map(node => [node.name, treeChange(node)])).toEqual([
    ['removed', 'deleted'], ['src', 'modified']
  ])
  expect(tree[1].children?.map(node => [node.name, node.change])).toEqual([
    ['edit.ts', 'modified'], ['keep.ts', undefined], ['new.ts', 'added']
  ])
  expect(original[0].children?.every(node => node.change === undefined)).toBe(true)
  expect(projectReviewTree(original, [])[0].children).toHaveLength(2)
})
