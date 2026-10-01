import { beforeEach, describe, expect, it } from 'vitest'
import type { MenuItemSpec } from '../../../packages/design-system/src/components/surfaces/Menu.js'
import type { Project } from '../src/main/projects/types.js'
import type { AppSnapshot } from '../src/main/snapshot.js'
import { sectionMenuItems } from '../src/renderer/src/components/SectionMenu.js'
import { projectMenuItems } from '../src/renderer/src/interaction/projectActions.js'
import { useStore } from '../src/renderer/src/state/store.js'

/**
 * The order of a project's right-click menu.
 *
 * Settings sat second, right under Open, where nobody looks for it: the rail pins Settings to
 * the bottom, and Finder-style menus go open → copy → change → delete. What is guaranteed
 * here is that both routes (a rail row and the list surface) put configuration last.
 */

const PROJECT: Project = {
  id: 'p1',
  name: 'Quuu',
  path: '/Users/me/Projects/taskd',
  color: '#5EABF1',
  priority: 2,
  targetKind: 'agent',
  targetId: 'a1',
  maxConcurrent: 2,
  enabled: true,
  deletedAt: null,
  importSince: null, worktreeMode: 'inherit', taskHooks: [],
  editorApp: '',
  reportEnabled: true,
  pullRequestPromptMode: 'inherit', pullRequestFailurePrompt: '', pullRequestPendingPrompt: '', pullRequestConflictPrompt: '', pullRequestFailureEnabled: false, pullRequestPendingEnabled: false, pullRequestConflictEnabled: false,
  commitIdentityMode: 'inherit',
  commitIdentity: { appSlug: '', botUserId: '' },
  builtIn: false, source: 'user',
  sortOrder: 0,
  createdAt: '',
  updatedAt: ''
}

function snapshot(projects: Project[]): AppSnapshot {
  return {
    projects,
    tasks: [],
    rules: [],
    agents: [],
    groups: [],
    runs: [],
    scheduler: {
      running: true,
      activeRuns: 0,
      totalSlots: 1,
      queued: 0,
      review: 0,
      failed: 0,
      agents: [],
      holds: [],
      warnings: [],
      lastTickAt: null
    }
  }
}

/** Labels with "—" where a separator is drawn, so the groups are part of what is compared. */
function outline(items: MenuItemSpec[]): string[] {
  return items.flatMap((item, i) => (item.separatorBefore && i > 0 ? ['—', item.label] : [item.label]))
}

beforeEach(() => {
  useStore.setState({ snapshot: snapshot([PROJECT]), section: { kind: 'all' }, editors: [] })
})

describe('a project right-click menu', () => {
  it('goes open → copy → stop → delete → settings, the way desktop menus are ordered', () => {
    expect(outline(projectMenuItems('p1'))).toEqual([
      'Open',
      '—', 'Open in Terminal', 'Open in App', 'Show in Finder',
      '—', 'Copy Directory',
      '—', 'Stop This Project',
      '—', 'Delete…',
      '—', 'Project Settings...'
    ])
  })

  it('still ends with settings for the built-in project, which has no Delete', () => {
    useStore.setState({ snapshot: snapshot([{ ...PROJECT, builtIn: true }]) })
    expect(projectMenuItems('p1').at(-2)?.label).toBe('Stop This Project')
    expect(projectMenuItems('p1').at(-1)?.label).toBe('Project Settings...')
  })

  it('puts the project part of the list surface menu in the same order', () => {
    useStore.setState({ section: { kind: 'project', id: 'p1' } })
    const labels = outline(sectionMenuItems())
    expect(labels.slice(labels.indexOf('Open in Terminal') - 1)).toEqual([
      '—', 'Open in Terminal', 'Open in App', 'Show in Finder',
      '—', 'Copy Directory',
      '—', 'Stop This Project',
      '—', 'Delete…',
      '—', 'Project Settings...'
    ])
  })
})
