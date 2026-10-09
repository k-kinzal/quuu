// @vitest-environment jsdom
import { createRouterClient, implement } from '@orpc/server'
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ThemeProvider } from '../../../packages/design-system/src/theme/ThemeProvider.js'
import { DEFAULT_SETTINGS } from '../src/main/settings/types.js'
import type { Project } from '../src/main/projects/types.js'
import { contract } from '../src/api/contract.js'
import { useStore } from '../src/renderer/src/state/store.js'
import { ProjectDetail } from '../src/renderer/src/views/project/ProjectDetail.js'

/** Sticky settings heads keep scrolled content below the native-control band.
 * Actual inset geometry is covered by window-controls.browser.test.ts in Chromium.
 */

afterEach(cleanup)

const PROJECT: Project = {
  id: 'p1',
  name: 'Quuu',
  path: '/tmp/quuu',
  color: '#5EABF1',
  priority: 2,
  targetKind: 'agent',
  targetId: null,
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

function open(railCollapsed: boolean): void {
  useStore.setState({
    settings: structuredClone(DEFAULT_SETTINGS),
    layout: { ...useStore.getState().layout, railCollapsed }
  })
}

beforeEach(() => {
  // Settings surfaces ask main for installed editors.
  const client = createRouterClient({ open: { editors: implement(contract.open.editors).handler(() => []) } })
  Object.defineProperty(window, 'quuu', { configurable: true, writable: true, value: client })
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

function find(container: HTMLElement, selector: string): HTMLElement {
  const element = container.querySelector<HTMLElement>(selector)
  if (!element) throw new Error(`${selector} is missing`)
  return element
}

/** The head of a settings surface. `<header>` inside a pane carries no landmark role of its own. */
const head = (container: HTMLElement): HTMLElement => find(container, 'header')
const surface = (container: HTMLElement): HTMLElement => find(container, '[data-pane="settings"]')
/** The surface's content box. It is the head's containing block, so its height bounds how far the head can stay put. */
const body = (container: HTMLElement): HTMLElement => find(container, '[data-pane="settings"] > div')
describe('settings scrolling beneath the window header', () => {
  it('holds the project settings head in place, so the body is what scrolls under it', () => {
    open(true)
    const { container } = render(
      <ThemeProvider colorScheme="dark">
        <ProjectDetail project={PROJECT} onBack={() => { }} />
      </ThemeProvider>
    )
    expect(getComputedStyle(head(container)).position).toBe('sticky')
    // The surface is longer than the window, so it is the one that scrolls
    expect(getComputedStyle(surface(container)).overflowY).toBe('auto')
  })

  /*
   * The head sticks inside the surface's content box, not inside the scrolling pane.
   * Left to shrink as a flex item, that box stops at the pane's height while the content
   * runs past it, and the head is carried off the top as soon as the surface is more than
   * one pane longer — on a short window, exactly where the settings are actually read.
   */
  it('lets the surface grow past the pane, so the head stays put however far down it goes', () => {
    open(true)
    const { container } = render(
      <ThemeProvider colorScheme="dark">
        <ProjectDetail project={PROJECT} onBack={() => { }} />
      </ThemeProvider>
    )
    expect(getComputedStyle(body(container)).flexShrink).toBe('0')
  })

})
