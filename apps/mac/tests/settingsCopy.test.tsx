import { createRouterClient, implement } from '@orpc/server'
import { DEFAULT_SETTINGS } from '../src/main/settings/types.js'
import { contract } from '../src/preload/contract.js'
import { useStore } from '../src/renderer/src/state/store.js'
// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { ThemeProvider } from '../../../packages/design-system/src/theme/ThemeProvider.js'
import type { TaskRule } from '../src/main/automation/conditions.js'
import type { Project } from '../src/main/projects/types.js'
import { ProjectDetail } from '../src/renderer/src/views/project/ProjectDetail.js'
import { TaskRuleEditor } from '../src/renderer/src/views/project/TaskRules.js'
import { AgentSettings } from '../src/renderer/src/views/settings/AgentSettings.js'
import { AppearanceSettings } from '../src/renderer/src/views/settings/AppearanceSettings.js'
import { GeneralSettings } from '../src/renderer/src/views/settings/GeneralSettings.js'
import { NotificationSettings } from '../src/renderer/src/views/settings/NotificationSettings.js'

/**
 * The **amount of text** on a settings surface (rule G-2).
 *
 * Settings is a surface listing "the things you can change", not a manual for the machinery.
 * Adding explanation is easy, so left alone the explanation outgrows the items
 * (that actually happened, down to the pickup rules being enumerated on screen).
 * It looks like a matter of taste, but whether it holds can be checked by machine, so it is checked here.
 */

afterEach(cleanup)

// jsdom has no color-scheme query. Fall back to the default (dark)
beforeAll(() => {
  useStore.setState({ settings: structuredClone(DEFAULT_SETTINGS) })
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

const PROJECT: Project = {
  id: 'p1',
  name: 'Quuu',
  path: '/Users/me/Projects/taskd',
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

const RULE: TaskRule = {
  id: 'r1',
  projectId: 'p1',
  name: 'Issue を消化する',
  prompt: 'gh issue list から 1 つ選んで直す',
  priority: 2,
  agentOverrideId: null,
  whenIdle: true,
  cron: '0 3 * * *',
  frequency: 'none',
  blockStatuses: ['queued', 'running'],
  enabled: true,
  dueAt: null,
  lastEnqueuedAt: null,
  sortOrder: 0,
  createdAt: '',
  updatedAt: ''
}

const VIEWS: Array<[string, () => JSX.Element]> = [
  ['general', GeneralSettings],
  ['notifications', NotificationSettings],
  ['appearance', AppearanceSettings],
  ['agents', AgentSettings],
  // A project's configuration is a surface of the same rank (rule F: settings placed in the entity's context)
  ['project', () => <ProjectDetail project={PROJECT} onBack={() => { }} />],
  ['automatic tasks', () => <TaskRuleEditor rule={RULE} onBack={() => { }} />]
]

function show(View: () => JSX.Element): HTMLElement {
  const { container } = render(
    <ThemeProvider colorScheme="dark">
      <View />
    </ThemeProvider>
  )
  return container
}

/**
 * Collect the sentences shown on screen.
 * What is set in monospace (commands, variable names, paths) is not prose, so it is not counted.
 */
function sentences(container: HTMLElement): string[] {
  const texts: string[] = []
  for (const node of container.querySelectorAll('*')) {
    if (node.children.length > 0) continue
    if (node.closest('code, input, textarea, select, option, pre')) continue
    const text = node.textContent?.trim()
    if (text) texts.push(text)
  }
  return texts
}

/** Display width counting full-width as 2 and half-width as 1. The "40 full-width characters" budget maps to 80 in English (half-width) */
function textWidth(text: string): number {
  let width = 0
  for (const ch of text)
    width += /[ᄀ-鿿가-힣豈-﫿︰-﹏＀-｠]/.test(ch) ? 2 : 1
  return width
}

/** How many sentence endings (a closing full stop) there are. An ellipsis "..." does not count as one */
function sentenceEnds(text: string): number {
  return (text.match(/。|(?<!\.)\.(?=\s|$)/g) ?? []).length
}

describe('the amount of text on a settings surface', () => {
  it.each(VIEWS)('%s puts no explanatory sentence under the heading', (_name, View) => {
    // A Page description is a <p> inside the heading. It becomes the place to restate the heading
    expect(show(View).querySelector('header p')).toBeNull()
  })

  it.each(VIEWS)('%s carries no prose (one sentence, 40 characters at most)', (_name, View) => {
    const long = sentences(show(View)).filter((t) => textWidth(t) > 80 || sentenceEnds(t) > 1)
    expect(long).toEqual([])
  })

  /**
   * A hint is written as a **phrase**. The moment it becomes a sentence it is a manual, not a screen.
   * A closing full stop is the machine-visible sign that a sentence was written, so that is what is checked.
   */
  it.each(VIEWS)('%s writes its hints as phrases (never ending in a full stop)', (_name, View) => {
    expect(sentences(show(View)).filter((t) => /。$|(?<!\.)\.$/.test(t))).toEqual([])
  })

  /**
   * Do not fill a list with nothing in it with prose (rule G-2).
   * "There is nothing here yet" is already said by the empty container itself.
   */
  it.each(VIEWS)('%s does not fill an empty list with prose', (_name, View) => {
    const filler = sentences(show(View)).filter((t) =>
      /ありません|ください|できます|\bthere (?:is|are) no\b|\bplease\b|\byou can\b/i.test(t)
    )
    expect(filler).toEqual([])
  })
})
