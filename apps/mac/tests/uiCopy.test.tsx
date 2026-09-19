// @vitest-environment jsdom
import { createRouterClient, implement } from '@orpc/server'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ThemeProvider } from '../../../packages/design-system/src/theme/ThemeProvider.js'
import type { Project } from '../src/main/projects/types.js'
import type { AppSnapshot } from '../src/main/snapshot.js'
import type { Task } from '../src/main/tasks/types.js'
import { contract } from '../src/preload/contract.js'
import { Chat } from '../src/renderer/src/components/Chat.js'
import { Composer } from '../src/renderer/src/components/Composer.js'
import { PendingTurn } from '../src/renderer/src/components/PendingTurn.js'
import { TaskComposer } from '../src/renderer/src/components/TaskComposer.js'
import { useStore } from '../src/renderer/src/state/store.js'
import { buildTheme } from '../src/renderer/src/ui/theme.js'

/**
 * The **amount of text** on a working surface (rule Q).
 *
 * The same thing the settings surfaces are checked for, applied to the surfaces that move a task along (chat, composer, unsent turns).
 * These actually used to sit here:
 *
 *   "It will be sent as soon as the run finishes", "It will be added to the unsent prompt"
 *   "Shift+Cmd+Enter to open", "Cmd+Enter to confirm / Esc to cancel"
 *
 * Every one was a restatement of the label on the button beside it, or a key hint written because
 * there was no pressable entry point: **a record of what the UI failed to say**. Such text is easy to add, so a machine checks for it.
 */

afterEach(cleanup)

beforeAll(() => {
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
  targetId: 'a1',
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

function task(over: Partial<Task> = {}): Task {
  return {
    id: 't1',
    projectId: 'p1',
    title: 'Issue を 1 つ消化する',
    prompt: '最初の指示',
    status: 'queued',
    priority: 2,
    seq: 0,
    scheduledAt: null,
    currentRunId: null,
    sessionId: null,
    agentOverrideId: null,
    pendingMessage: '',
    reservedMessage: '',
    reviewNote: '',
    dependsOn: [],
    source: 'user',
    ruleId: null,
    externalKey: null,
    archived: false,
    createdAt: '',
    updatedAt: '',
    doneAt: null,
    ...over
  }
}

const SNAPSHOT: AppSnapshot = {
  projects: [PROJECT],
  tasks: [task()],
  rules: [],
  agents: [
    {
      id: 'a1',
      name: 'Claude',
      description: '',
      command: 'claude',
      argsTemplate: ['--permission-mode', 'bypassPermissions', '{{prompt}}'],
      resumeArgsTemplate: ['--resume', '{{sessionId}}', '{{prompt}}'],
      env: {},
      concurrency: 1,
      fallbackAgentId: null,
      limitPatterns: [],
      cooldownSeconds: 900,
      timeoutSeconds: 0,
      logAdapter: 'claude',
      enabled: true,
      source: 'user',
      sortOrder: 0,
      createdAt: '',
      updatedAt: ''
    }
  ],
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

beforeEach(() => {
  useStore.setState({
    snapshot: SNAPSHOT,
    drafts: {},
    runs: [],
    selectedRunId: null,
    session: null,
    sessionLoading: false,
    targetProjectId: null
  })
  const os = implement(contract)
  const client = createRouterClient({
    tasks: { update: os.tasks.update.handler(() => task()) },
    system: { reveal: os.system.reveal.handler(() => undefined) }
  })
  Object.defineProperty(window, 'quuu', { configurable: true, writable: true, value: client })
})

function show(node: JSX.Element): HTMLElement {
  const { container } = render(
    <ThemeProvider colorScheme="dark" buildTheme={buildTheme}>
      {node}
    </ThemeProvider>
  )
  return container
}

/**
 * Collect the sentences shown on screen.
 * What is set in monospace (commands, paths) and the input itself are not prose, so they are not counted.
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
    width += /[ᄀ-鿿가-힣豈-﫿︰-﹏＀-｠]/.test(ch) ? 2 : 1
  return width
}

/** How many sentence endings (a closing full stop) there are. An ellipsis "..." does not count as one */
function sentenceEnds(text: string): number {
  return (text.match(/。|(?<!\.)\.(?=\s|$)/g) ?? []).length
}

/** Every piece of "text meant to be read" on screen, placeholders and tooltips included. */
function copy(container: HTMLElement): string[] {
  const extra: string[] = []
  for (const node of container.querySelectorAll('[placeholder], [title]')) {
    const placeholder = node.getAttribute('placeholder')
    const title = node.getAttribute('title')
    if (placeholder) extra.push(placeholder)
    if (title) extra.push(title)
  }
  return [...sentences(container), ...extra]
}

/**
 * The surfaces that move a task along. Composer states are listed only where "what pressing does" changes
 * (running / first run / adding to the prompt / sent back / holding a reservation).
 */
const SURFACES: Array<[string, () => JSX.Element]> = [
  ['chat (nothing there yet)', () => <Chat task={task({ prompt: '', status: 'draft' })} project={PROJECT} />],
  ['chat (with a prompt)', () => <Chat task={task()} project={PROJECT} />],
  ['composer (first run)', () => <Composer task={task({ prompt: '', status: 'draft' })} project={PROJECT} />],
  ['composer (adding to the prompt)', () => <Composer task={task()} project={PROJECT} />],
  [
    'composer (running)',
    () => <Composer task={task({ status: 'running', sessionId: 's1' })} project={PROJECT} />
  ],
  [
    'composer (sent back)',
    () => <Composer task={task({ status: 'review', sessionId: 's1' })} project={PROJECT} />
  ],
  [
    'composer (holding a reserved send)',
    () => (
      <Composer
        task={task({ status: 'running', sessionId: 's1', reservedMessage: 'テストも足して' })}
        project={PROJECT}
      />
    )
  ],
  [
    'composer (a reservation stalled unsent)',
    () => (
      <Composer
        task={task({ status: 'review', sessionId: 's1', reservedMessage: 'テストも足して' })}
        project={PROJECT}
      />
    )
  ],
  ['add a task', () => <TaskComposer />],
  [
    'an unsent prompt',
    () => <PendingTurn task={task()} next={{ field: 'prompt', value: '最初の指示' }} />
  ],
  [
    'an unsent follow-up',
    () => (
      <PendingTurn
        task={task({ pendingMessage: 'テストも足して', sessionId: 's1' })}
        next={{ field: 'pendingMessage', value: 'テストも足して' }}
      />
    )
  ]
]

describe('the amount of text on a working surface', () => {
  it.each(SURFACES)('%s carries no prose (one sentence, 40 characters at most)', (_name, View) => {
    const long = copy(show(<View />)).filter(
      (t) => textWidth(t) > 80 || sentenceEnds(t) > 1
    )
    expect(long).toEqual([])
  })

  it.each(SURFACES)('%s writes its hints as phrases (never ending in a full stop)', (_name, View) => {
    expect(copy(show(<View />)).filter((t) => /。$|(?<!\.)\.$/.test(t))).toEqual([])
  })

  /**
   * No key hints written on screen (rule Q).
   * The urge to write one comes up when the action has **no pressable entry point**,
   * and what is missing is a button, not a sentence. The keys belong to the OS menu and the tooltip.
   */
  it.each(SURFACES)('%s writes no key hints', (_name, View) => {
    const keys = sentences(show(<View />)).filter((t) => /[⌘⇧⌥⏎↵]|Esc|Enter|エンター/.test(t))
    expect(keys).toEqual([])
  })

  /**
   * No sentence saying "this is what happens when you press it" (rule Q).
   * The label and the icon on the button say the outcome.
   */
  it.each(SURFACES)('%s carries no restatement of what pressing does', (_name, View) => {
    const explain = sentences(show(<View />)).filter((t) =>
      /します$|します。|送ります|できます|ください|ありません|\bwill\b|\byou can\b|\bplease\b/i.test(t)
    )
    expect(explain).toEqual([])
  })
})

describe('what was put there instead of an explanation', () => {
  it('says with a marker and a color whether a held reservation is going to be sent', () => {
    show(
      <Composer
        task={task({ status: 'running', sessionId: 's1', reservedMessage: 'テストも足して' })}
        project={PROJECT}
      />
    )
    // The marker (the band) and the leading pressable (the button) say it in the same words
    expect(screen.getAllByText('Scheduled').length).toBeGreaterThan(0)
    // While it will go automatically, "send now" is not shown (showing it is the signal that it has stalled)
    expect(screen.queryByRole('button', { name: 'Send Now' })).toBeNull()
  })

  it('offers a way to send it alongside the "unsent" marker once it has stalled', () => {
    show(
      <Composer
        task={task({ status: 'review', sessionId: 's1', reservedMessage: 'テストも足して' })}
        project={PROJECT}
      />
    )
    expect(screen.getByText('Unsent')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Send Now' })).toBeTruthy()
  })

  it('gives an unsent turn a pressable confirm and discard while it is being written', () => {
    show(<PendingTurn task={task()} next={{ field: 'prompt', value: '最初の指示' }} />)

    // While nothing is being written there is only "edit". There is nothing to confirm yet
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()

    fireEvent.focus(screen.getByLabelText('Instructions to send on the next run'))
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Revert' })).toBeTruthy()
  })

  it('puts the next move on an empty chat instead of explaining how to fill it', () => {
    show(<Chat task={task({ prompt: '', status: 'draft' })} project={PROJECT} />)
    expect(screen.getByRole('button', { name: 'Write Instructions' })).toBeTruthy()
  })
})
