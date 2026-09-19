import { describe, expect, it } from 'vitest'
import type { Project } from '../src/main/projects/types.js'
import { defaultTargetProjectId } from '../src/renderer/src/model/derive.js'

function project(id: string): Project {
  return {
    id,
    name: id,
    path: `/tmp/${id}`,
    color: '#fff',
    priority: 2,
    targetKind: 'agent',
    targetId: null,
    maxConcurrent: 1,
    enabled: true,
    deletedAt: null,
    importSince: null,
    commitIdentityMode: 'inherit',
    editorApp: '',
    reportEnabled: true,
    commitIdentity: { appSlug: '', botUserId: '' },
    source: 'user',
    sortOrder: 0,
    createdAt: '',
    updatedAt: ''
  }
}

/**
 * Where a queued task lands. The one-line input in the list and the composer at the bottom go through the same rule.
 * The rule exists to save the work of choosing, so it is pinned down as a rule.
 */
describe('where a queued task lands', () => {
  const projects = [project('a'), project('b'), project('c')]

  it('queues into that project on a project screen (the level beats what was chosen)', () => {
    expect(defaultTargetProjectId('b', 'c', 'c', projects)).toBe('b')
  })

  it('lets a destination chosen by hand win over the open task', () => {
    expect(defaultTargetProjectId(null, 'b', 'c', projects)).toBe('b')
  })

  it('queues into the same project as the open task when nothing was chosen', () => {
    expect(defaultTargetProjectId(null, null, 'c', projects)).toBe('c')
  })

  it('falls back to the first project when there is neither', () => {
    expect(defaultTargetProjectId(null, null, null, projects)).toBe('a')
  })

  it('does not crash while pointing at a deleted project (a vanished choice falls to the next rule)', () => {
    expect(defaultTargetProjectId('zz', 'yy', 'xx', projects)).toBe('a')
    expect(defaultTargetProjectId(null, 'zz', 'c', projects)).toBe('c')
  })

  it('returns null when there is no destination at all (i.e. no entry point for queueing is shown)', () => {
    expect(defaultTargetProjectId('a', 'b', 'c', [])).toBeNull()
    expect(defaultTargetProjectId(null, null, null, [])).toBeNull()
  })
})
