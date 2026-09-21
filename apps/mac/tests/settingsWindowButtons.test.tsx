// @vitest-environment jsdom
import { createRouterClient, implement } from '@orpc/server'
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ThemeProvider } from '../../../packages/design-system/src/theme/ThemeProvider.js'
import { DEFAULT_SETTINGS } from '../src/main/settings/types.js'
import { WINDOW_BUTTONS, WINDOW_BUTTONS_INSET, COLLAPSED_RAIL_WIDTH, WINDOW_BUTTONS_OVERHANG } from '../src/main/windowGeometry.js'
import type { Project } from '../src/main/projects/types.js'
import { contract } from '../src/preload/contract.js'
import { useStore } from '../src/renderer/src/state/store.js'
import { ProjectDetail } from '../src/renderer/src/views/project/ProjectDetail.js'
import { SettingsShell } from '../src/renderer/src/views/SettingsShell.js'

/**
 * The settings surfaces and the traffic lights (close, minimize, zoom).
 *
 * The window has no title bar, so with the rail collapsed **the settings surfaces take
 * the window's top-left corner** — the one spot where a click belongs to the window and
 * not to the page. Their heads sat under the lights, so the way back and the title were
 * unreadable and half-unclickable. The head only steps aside when the rail is collapsed,
 * which is exactly the condition that is easy to get backwards, so it is checked here.
 *
 * A settings surface is also longer than the window, so its body scrolls. The head has to
 * stay put while it does — otherwise the body is what ends up under the lights instead.
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
  importSince: null,
  editorApp: '',
  reportEnabled: true,
  commitIdentityMode: 'inherit',
  commitIdentity: { appSlug: '', botUserId: '' },
  source: 'user',
  sortOrder: 0,
  createdAt: '',
  updatedAt: ''
}

function open(railCollapsed: boolean): void {
  useStore.setState({
    settings: structuredClone(DEFAULT_SETTINGS),
    layout: { ...useStore.getState().layout, railCollapsed },
    windowLayout: {
      leftInset: WINDOW_BUTTONS_INSET,
      collapsedRailWidth: COLLAPSED_RAIL_WIDTH,
      overhang: WINDOW_BUTTONS_OVERHANG
    }
  })
}

beforeEach(() => {
  // The general surface recounts the installed IDEs when it opens (it goes and asks main)
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

/** What the surface leaves clear at its leading edge, counted from the window's left edge. */
function clearedFromWindowEdge(element: HTMLElement): number {
  return COLLAPSED_RAIL_WIDTH + Number.parseFloat(getComputedStyle(element).paddingLeft)
}

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
const categoryTitle = (container: HTMLElement): HTMLElement => find(container, 'nav h1')

describe('settings surfaces and the window traffic lights', () => {
  it('keeps the project settings head clear of the lights while the rail is collapsed', () => {
    open(true)
    const { container } = render(
      <ThemeProvider colorScheme="dark">
        <ProjectDetail project={PROJECT} onBack={() => { }} />
      </ThemeProvider>
    )
    expect(clearedFromWindowEdge(head(container))).toBeGreaterThanOrEqual(WINDOW_BUTTONS.x + WINDOW_BUTTONS.width)
  })

  it('takes the space back once the rail is open (the lights moved onto the rail)', () => {
    open(false)
    const { container } = render(
      <ThemeProvider colorScheme="dark">
        <ProjectDetail project={PROJECT} onBack={() => { }} />
      </ThemeProvider>
    )
    expect(Number.parseFloat(getComputedStyle(head(container)).paddingLeft)).toBeLessThan(WINDOW_BUTTONS_OVERHANG)
  })

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

  it('keeps the settings category title clear of the lights while the rail is collapsed', () => {
    open(true)
    const { container } = render(
      <ThemeProvider colorScheme="dark">
        <SettingsShell />
      </ThemeProvider>
    )
    expect(clearedFromWindowEdge(categoryTitle(container))).toBeGreaterThanOrEqual(WINDOW_BUTTONS.x + WINDOW_BUTTONS.width)
  })

  it('leaves the settings category title where it is once the rail is open', () => {
    open(false)
    const { container } = render(
      <ThemeProvider colorScheme="dark">
        <SettingsShell />
      </ThemeProvider>
    )
    expect(Number.parseFloat(getComputedStyle(categoryTitle(container)).paddingLeft)).toBeLessThan(WINDOW_BUTTONS_OVERHANG)
  })
})
