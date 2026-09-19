// @vitest-environment jsdom
import { createRouterClient, implement } from '@orpc/server'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ThemeProvider } from '@design-system/react'
import type { Project } from '../src/main/projects/types.js'
import type { SessionMessage, SessionSnapshot } from '../src/main/session/types.js'
import type { Task } from '../src/main/tasks/types.js'
import { contract } from '../src/preload/contract.js'
import { Chat } from '../src/renderer/src/components/Chat.js'
import { t } from '../src/renderer/src/model/i18n/index.js'
import { useStore } from '../src/renderer/src/state/store.js'
import { buildTheme } from '../src/renderer/src/ui/theme.js'

/**
 * Reading a long run backwards.
 *
 * A page arriving in front of the window must leave what the reader was looking at where
 * it was. On a real run a page cuts through one long response, and losing the place did two
 * things at once: the pane showed some other part of the run, and — still at the top
 * edge — asked for the next page, and the next, until the run could not be read in order.
 */

const ITEM = 100
const VIEW = 300
const TOTAL = 400
/** Prose on both sides of the first page boundary, so the window's first item folds into the page that arrives */
const PROSE = new Set([318, 319, 320, 321])

const message = (i: number): SessionMessage => ({
  id: `m${i}`,
  role: i === 0 ? 'user' : 'assistant',
  isSidechain: false,
  timestamp: null,
  model: null,
  blocks: i === 0 || PROSE.has(i)
    ? [{ kind: 'text', text: i === 0 ? 'Rebuild it' : `Paragraph ${i}` }]
    : [{ kind: 'tool', tool: i % 2
      ? { id: `call-${i}`, name: 'Read', input: { file_path: `src/part${i}.ts` }, target: null, result: 'ok', isError: false, images: [] }
      : { id: `call-${i}`, name: 'Bash', input: { command: `npm test -- part${i}` }, target: null, result: 'ok', isError: false, images: [] } }]
})

const page = (first: number, last: number): SessionSnapshot => ({
  sessionId: 's1', logPath: '/tmp/s1.jsonl', exists: true, title: null,
  messages: Array.from({ length: last - first }, (_, i) => message(first + i)),
  hasMore: first > 0, hasNewer: last < TOTAL, totalMessages: TOTAL, first, last, generation: 'g1', indexing: false
})

const PROJECT: Project = {
  id: 'p1', name: 'Quuu', path: '/Users/me/Projects/taskd', color: '#5EABF1', priority: 2, targetKind: 'agent', targetId: 'a1',
  maxConcurrent: 2, enabled: true, deletedAt: null, importSince: null, editorApp: '', reportEnabled: true,
  commitIdentityMode: 'inherit', commitIdentity: { appSlug: '', botUserId: '' }, source: 'user', sortOrder: 0, createdAt: '', updatedAt: ''
}
const TASK: Task = {
  id: 't1', projectId: 'p1', title: 'Rebuild it', prompt: 'Rebuild it', status: 'review', priority: 2, seq: 0, scheduledAt: null,
  currentRunId: 'r1', sessionId: 's1', agentOverrideId: null, pendingMessage: '', reservedMessage: '', reviewNote: '', dependsOn: [],
  source: 'user', ruleId: null, externalKey: null, archived: false, createdAt: '', updatedAt: '', doneAt: null
}

const scrollPositions = new WeakMap<HTMLElement, number>()

beforeEach(() => {
  window.matchMedia = query => ({ matches: false, media: query, onchange: null, addListener: () => undefined, removeListener: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => false })
  vi.stubGlobal('IntersectionObserver', class { observe(): void {} disconnect(): void {} })
  // Every item is one fixed height, stacked from the top of the conversation
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(VIEW)
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return Math.max(VIEW, this.querySelectorAll('[data-chat-item]').length * ITEM)
  })
  vi.spyOn(HTMLElement.prototype, 'scrollTop', 'get').mockImplementation(function (this: HTMLElement) { return scrollPositions.get(this) ?? 0 })
  vi.spyOn(HTMLElement.prototype, 'scrollTop', 'set').mockImplementation(function (this: HTMLElement, value: number) {
    scrollPositions.set(this, Math.max(0, Math.min(value, this.scrollHeight - this.clientHeight)))
  })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const viewport = this.closest<HTMLElement>('[data-pane="chat"]')
    const items = Array.from(viewport?.querySelectorAll<HTMLElement>('[data-chat-item]') ?? [])
    const index = items.indexOf(this)
    const top = index < 0 ? 0 : index * ITEM - (viewport?.scrollTop ?? 0)
    const height = index < 0 ? VIEW : ITEM
    return { x: 0, y: top, top, left: 0, width: 600, height, right: 600, bottom: top + height, toJSON: () => ({}) }
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('keeps the reader\'s place when a page arrives in front of a response that the window cut mid-way', async () => {
  const loadMore = vi.fn((input: { runId: string; direction: string }) => page(input.direction === 'older' ? 240 : 320, TOTAL))
  const os = implement(contract)
  Object.defineProperty(window, 'quuu', {
    configurable: true, writable: true,
    value: createRouterClient({ session: { loadMore: os.session.loadMore.handler(({ input }) => loadMore(input)) } })
  })
  useStore.setState({ runs: [], selectedRunId: 'r1', session: page(320, TOTAL), sessionLoading: false })
  render(<ThemeProvider colorScheme="dark" buildTheme={buildTheme}><Chat task={TASK} project={PROJECT} /></ThemeProvider>)
  const viewport = screen.getByLabelText(t('chat.pane'))
  const names = (): string[] => Array.from(viewport.querySelectorAll<HTMLElement>('[data-chat-item]'), node => node.dataset.chatItem ?? '')

  // Opens at the latest: two paragraphs folded into one item, then one item per tool call
  expect(names()).toHaveLength(79)
  expect(names()[0]).toBe('m320:0')
  expect(viewport.scrollTop).toBe(79 * ITEM - VIEW)

  // Wheeling up at the top edge asks for the page before this one, even though nothing can scroll any further
  viewport.scrollTop = 0
  fireEvent.wheel(viewport, { deltaY: -120 })
  fireEvent.scroll(viewport)
  await waitFor(() => expect(names()).toHaveLength(157))
  expect(loadMore).toHaveBeenCalledWith({ runId: 'r1', direction: 'older' })

  // The page went in front; the run still reads in order, and the item that was at the top edge is still there
  const order = names().map(name => Number(name.slice(1, name.indexOf(':'))))
  expect(order).toEqual([...order].sort((a, b) => a - b))
  expect(names()[78]).toBe('m318:0')
  expect(viewport.scrollTop).toBe(78 * ITEM)
  expect(screen.getByText('Paragraph 321').closest('[data-chat-item]')?.getBoundingClientRect().top).toBe(0)

  // Nothing near the top edge any more, so neither the pane settling nor the next wheel tick asks for yet another page
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
  fireEvent.scroll(viewport)
  fireEvent.wheel(viewport, { deltaY: -120 })
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
  expect(loadMore).toHaveBeenCalledTimes(1)
})

/** One call of a tool. Consecutive calls of the same tool fold into a single line on screen */
const call = (i: number, name: 'Read' | 'Bash'): SessionMessage => ({
  id: `m${i}`, role: 'assistant', isSidechain: false, timestamp: null, model: null,
  blocks: [{ kind: 'tool', tool: { id: `call-${i}`, name, input: name === 'Bash' ? { command: `npm test -- part${i}` } : { file_path: `src/part${i}.ts` }, target: null, result: 'ok', isError: false, images: [] } }]
})
/** A run whose middle (160–319) is one long stretch of the same tool; either side alternates so each call stays its own line */
const folded = (i: number): SessionMessage =>
  i === 0 ? message(0) : i >= 160 && i < 320 ? call(i, 'Bash') : call(i, (i % 2 === 1) === (i < 160) ? 'Read' : 'Bash')
const foldedPage = (first: number, last: number): SessionSnapshot =>
  ({ ...page(first, last), messages: Array.from({ length: last - first }, (_, i) => folded(first + i)) })

it('asks for the newer page only when the reader heads there, not because an earlier page left the window\'s end within reach', async () => {
  const loadMore = vi.fn((input: { runId: string; direction: string }) => input.direction === 'older' ? foldedPage(80, 320) : foldedPage(160, TOTAL))
  const os = implement(contract)
  Object.defineProperty(window, 'quuu', {
    configurable: true, writable: true,
    value: createRouterClient({ session: { loadMore: os.session.loadMore.handler(({ input }) => loadMore(input)) } })
  })
  useStore.setState({ runs: [], selectedRunId: 'r1', session: foldedPage(160, TOTAL), sessionLoading: false })
  render(<ThemeProvider colorScheme="dark" buildTheme={buildTheme}><Chat task={TASK} project={PROJECT} /></ThemeProvider>)
  const viewport = screen.getByLabelText(t('chat.pane'))
  const names = (): string[] => Array.from(viewport.querySelectorAll<HTMLElement>('[data-chat-item]'), node => node.dataset.chatItem ?? '')

  // The stretch of one tool is a single line, then one line per call
  expect(names()).toHaveLength(81)
  expect(names()[0]).toBe('m160:0')

  viewport.scrollTop = 0
  fireEvent.wheel(viewport, { deltaY: -120 })
  await waitFor(() => expect(names()[0]).toBe('m80:0'))
  expect(loadMore).toHaveBeenCalledTimes(1)

  // The page went in front and the window let go of its newest part. Below the reader only the
  // folded line remains, so the window's end is now within reach of the edge
  expect(names()).toHaveLength(81)
  expect(names()[80]).toBe('m160:0')
  expect(viewport.scrollTop).toBe(81 * ITEM - VIEW)

  // The pane settling there is not the reader heading for the newer page. Before, it was taken
  // as one, and the window bounced straight back to where it had been
  fireEvent.scroll(viewport)
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
  expect(loadMore).toHaveBeenCalledTimes(1)
  expect(names()[0]).toBe('m80:0')

  // Wheeling down from there is
  fireEvent.wheel(viewport, { deltaY: 120 })
  await waitFor(() => expect(loadMore).toHaveBeenCalledTimes(2))
  expect(loadMore).toHaveBeenLastCalledWith({ runId: 'r1', direction: 'newer' })
  await waitFor(() => expect(names()[0]).toBe('m160:0'))
})
