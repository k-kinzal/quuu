import { DEFAULT_SETTINGS } from '../src/main/settings/types.js'
import { useStore } from '../src/renderer/src/state/store.js'
// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { Project } from '../src/main/projects/types.js'
import { ThemeProvider } from '../../../packages/design-system/src/theme/ThemeProvider.js'
import { ProjectDetail } from '../src/renderer/src/views/project/ProjectDetail.js'

/**
 * Project settings.
 *
 * The inputs hold no value, so nothing is written back mid-typing (`defaultValue`).
 * Built that way, opening another project **leaves the previous value sitting there**.
 * A leftover value is saved by merely touching the field and leaving, so it is more than a cosmetic problem.
 */

afterEach(cleanup)

beforeAll(() => {
  useStore.setState({ settings: structuredClone(DEFAULT_SETTINGS) })
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => { },
    removeListener: () => { },
    addEventListener: () => { },
    removeEventListener: () => { },
    dispatchEvent: () => false
  })
})

function project(over: Partial<Project> & { id: string; name: string }): Project {
  return {
    path: `/tmp/${over.id}`,
    color: '#fff',
    priority: 2,
    targetKind: 'agent',
    targetId: null,
    maxConcurrent: 1,
    enabled: true,
    deletedAt: null,
    importSince: null,
    editorApp: '',
    reportEnabled: true,
    commitIdentityMode: 'inherit',
    commitIdentity: { appSlug: '', botUserId: '' },
    source: 'user',
    sortOrder: 0,
    createdAt: '',
    updatedAt: '',
    ...over
  }
}

const view = (p: Project): JSX.Element => (
  <ThemeProvider colorScheme="dark">
    <ProjectDetail project={p} onBack={() => { }} />
  </ThemeProvider>
)

describe('project settings', () => {
  it('swaps the inputs too when another project is opened (it never writes the previous name back)', () => {
    const { rerender } = render(view(project({ id: 'p1', name: 'Quuu', priority: 1 })))
    expect(screen.getByDisplayValue('Quuu')).toBeInTheDocument()

    rerender(view(project({ id: 'p2', name: 'tmp', priority: 5 })))
    expect(screen.getByDisplayValue('tmp')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('Quuu')).not.toBeInTheDocument()
    expect(screen.getByDisplayValue('5')).toBeInTheDocument()
  })

})
