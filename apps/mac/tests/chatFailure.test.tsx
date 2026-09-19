// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { ThemeProvider } from '@design-system/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Run } from '../src/main/execution/types.js'
import type { Project } from '../src/main/projects/types.js'
import type { SessionMessage, SessionSnapshot } from '../src/main/session/types.js'
import type { Task } from '../src/main/tasks/types.js'
import { Chat } from '../src/renderer/src/components/Chat.js'
import { t } from '../src/renderer/src/model/i18n/index.js'
import { useStore } from '../src/renderer/src/state/store.js'
import { buildTheme } from '../src/renderer/src/ui/theme.js'

/**
 * What a failed run leaves on the conversation surface.
 *
 * The screen this locks down was real: a run died against a model's limit, and the same sentence
 * was on it three times - the CLI writes its "You've reached your limit" into the session as the
 * agent's own turn, Quuu printed it again in a box at the head of the pane, and the instruction
 * that had already been handed over sat underneath as "not sent yet".
 */

const LIMIT = "You've reached your Fable limit. Switch to another model, or manage usage credits."
const ASKED = '対応AIにagy、grok、opencodeのサポートをお願いします。'
const STARTED = '2026-09-19T08:03:21.988Z'

const PROJECT: Project = {
  id: 'p1', name: 'Quuu', path: '/tmp', color: '#5EABF1', priority: 2, targetKind: 'agent', targetId: 'a1',
  maxConcurrent: 2, enabled: true, deletedAt: null, importSince: null, editorApp: '', reportEnabled: true,
  commitIdentityMode: 'inherit', commitIdentity: { appSlug: '', botUserId: '' }, source: 'user', sortOrder: 0, createdAt: '', updatedAt: ''
}
const TASK: Task = {
  id: 't1', projectId: 'p1', title: '対応AIの追加', prompt: ASKED, status: 'failed', priority: 2, seq: 0, scheduledAt: null,
  currentRunId: 'r1', sessionId: 's1', agentOverrideId: null, pendingMessage: '', reservedMessage: '', reviewNote: '', dependsOn: [],
  source: 'user', ruleId: null, externalKey: null, archived: false, createdAt: '', updatedAt: '', doneAt: null
}
const RUN = {
  id: 'r1', taskId: 't1', agentId: 'a1', resolvedFromGroupId: null, sessionId: 's1', kind: 'initial',
  status: 'failed', attempt: 1, fallbackFromRunId: null, pid: null, cwd: '/tmp', command: 'claude', args: [],
  promptPreview: ASKED, exitCode: 1, errorKind: 'nonzero-exit', errorMessage: LIMIT, sessionLogPath: null,
  stdoutLogPath: '/tmp/r1.log', source: 'user', externalKey: null, startedAt: STARTED, endedAt: STARTED
} satisfies Run

const said = (role: 'user' | 'assistant', text: string): SessionMessage => ({
  id: `m-${role}`, role, isSidechain: false, timestamp: STARTED, model: null, blocks: [{ kind: 'text', text }]
})

function conversation(messages: SessionMessage[]): SessionSnapshot {
  return {
    sessionId: 's1', logPath: '/tmp/s1.jsonl', exists: true, title: null, messages,
    hasMore: false, hasNewer: false, totalMessages: messages.length, first: 0, last: messages.length,
    generation: 'g1', indexing: false
  }
}

function show(task: Task, messages: SessionMessage[], run: Run = RUN): void {
  useStore.setState({ runs: [run], selectedRunId: run.id, session: conversation(messages), sessionLoading: false })
  render(<ThemeProvider colorScheme="dark" buildTheme={buildTheme}><Chat task={task} project={PROJECT} /></ThemeProvider>)
}

beforeEach(() => {
  window.matchMedia = query => ({ matches: false, media: query, onchange: null, addListener: () => undefined, removeListener: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => false })
  vi.stubGlobal('IntersectionObserver', class { observe(): void {} disconnect(): void {} })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('says why a run failed once, reading the agent\'s own account rather than repeating it', () => {
  show(TASK, [said('user', ASKED), said('assistant', LIMIT)])

  expect(screen.getAllByText(LIMIT)).toHaveLength(1)
  // What the box still adds is the reading: this ended the run, and how
  const box = screen.getByRole('status')
  expect(box.textContent).toContain(t('chat.runFailed'))
  expect(box.textContent).toContain(t('runErrorKind.nonzero-exit'))
})

it('keeps the reason when the conversation never carried it', () => {
  show(TASK, [said('user', ASKED)])

  expect(screen.getByRole('status').textContent).toContain(LIMIT)
})

it('puts how the run ended after the last thing the agent said, not above the conversation', () => {
  show(TASK, [said('user', ASKED), said('assistant', LIMIT)])

  const pane = screen.getByLabelText(t('chat.pane'))
  const spoke = screen.getAllByText(LIMIT)[0]
  expect(spoke.compareDocumentPosition(screen.getByRole('status')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(pane.contains(screen.getByRole('status'))).toBe(true)
})

it('does not offer an instruction the agent already has as one still to be sent', () => {
  const waiting = { ...TASK, status: 'queued' as const, pendingMessage: 'please continue' }
  const limited = { ...RUN, status: 'limited' as const, errorKind: 'limit' as const, kind: 'followup' as const }
  show(waiting, [said('user', ASKED), said('user', 'please continue')], limited)

  expect(screen.getAllByText('please continue')).toHaveLength(1)
  expect(screen.queryByText(t('pendingTurn.waiting'))).toBeNull()
})

it('still offers the part of an instruction the agent never received', () => {
  const waiting = { ...TASK, status: 'queued' as const, pendingMessage: 'please continue\n\nそのあとテストも' }
  const limited = { ...RUN, status: 'limited' as const, errorKind: 'limit' as const, kind: 'followup' as const }
  show(waiting, [said('user', ASKED), said('user', 'please continue')], limited)

  expect(screen.getByText(t('pendingTurn.waiting'))).toBeTruthy()
  expect(screen.getByDisplayValue('そのあとテストも')).toBeTruthy()
})
