// @vitest-environment jsdom
import { createRouterClient, implement } from '@orpc/server'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { ThemeProvider } from '@design-system/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { contract } from '../src/api/contract.js'
import type { HookRun } from '../src/api/schemas/hooks.js'
import type { Run } from '../src/main/execution/types.js'
import type { Project } from '../src/main/projects/types.js'
import type { SessionMessage } from '../src/main/session/types.js'
import type { Task } from '../src/main/tasks/types.js'
import { Chat } from '../src/renderer/src/components/Chat.js'
import { buildTurns } from '../src/renderer/src/model/summarize.js'
import { placeByTime } from '../src/renderer/src/model/timeline.js'
import { queryClient } from '../src/renderer/src/state/queryClient.js'
import { useStore } from '../src/renderer/src/state/store.js'
import { buildTheme } from '../src/renderer/src/ui/theme.js'

/**
 * Hooks and the report happen beside the conversation. The chat reads in time order, so each
 * one sits where it happened, not gathered under the last turn.
 */

const said = (id: string, role: 'user' | 'assistant', text: string, timestamp: string | null): SessionMessage => ({
  id, role, isSidechain: false, timestamp, model: null, blocks: [{ kind: 'text', text }]
})
const MESSAGES = [
  said('m1', 'user', 'Rebuild the palette', '2026-09-28T01:00:00Z'),
  said('m2', 'assistant', 'Rebuilt it', '2026-09-28T01:05:00Z'),
  said('m3', 'user', 'Align the rules too', '2026-09-28T02:00:00Z'),
  said('m4', 'assistant', 'Aligned them', '2026-09-28T02:05:00Z')
]
const at = (id: string, time: string): { id: string; at: string } => ({ id, at: time })
const ids = (entries: { id: string }[] | undefined): string[] => (entries ?? []).map(entry => entry.id)

describe('placing entries among turns by time', () => {
  it('puts each entry after the last turn that began no later than it', () => {
    const placed = placeByTime(buildTurns(MESSAGES), [
      at('last', '2026-09-28T02:10:00Z'), at('first', '2026-09-28T00:59:00Z'),
      at('between', '2026-09-28T01:10:00Z'), at('same', '2026-09-28T02:00:00Z')
    ], { older: false, newer: false })
    expect(ids(placed.before)).toEqual(['first'])
    expect(ids(placed.after.get('m2'))).toEqual(['between'])
    expect(ids(placed.after.get('m3'))).toEqual(['same'])
    expect(ids(placed.end)).toEqual(['last'])
  })

  it('leaves out what lies beyond a window that stops short of the conversation', () => {
    const placed = placeByTime(buildTurns(MESSAGES), [
      at('earlier', '2026-09-28T00:00:00Z'), at('inside', '2026-09-28T01:10:00Z'), at('later', '2026-09-28T03:00:00Z')
    ], { older: true, newer: true })
    expect(ids(placed.before)).toEqual([])
    expect(ids(placed.after.get('m2'))).toEqual(['inside'])
    expect(ids(placed.end)).toEqual([])
  })

  it('keeps every entry at the end of a log without timestamps', () => {
    const untimed = MESSAGES.map(message => ({ ...message, timestamp: null }))
    const placed = placeByTime(buildTurns(untimed), [at('hook', '2026-09-28T01:10:00Z')], { older: false, newer: false })
    expect(ids(placed.end)).toEqual(['hook'])
    expect(placed.after.size).toBe(0)
  })
})

const PROJECT: Project = {
  id: 'p1', name: 'Quuu', path: '/tmp', color: '#5EABF1', priority: 2, targetKind: 'agent', targetId: 'a1',
  maxConcurrent: 2, enabled: true, deletedAt: null, importSince: null, worktreeMode: 'inherit', taskHooks: [], editorApp: '', reportEnabled: true,
  pullRequestPromptMode: 'inherit', pullRequestFailurePrompt: '', pullRequestPendingPrompt: '', pullRequestConflictPrompt: '', pullRequestFailureEnabled: false, pullRequestPendingEnabled: false, pullRequestConflictEnabled: false,
  commitIdentityMode: 'inherit', commitIdentity: { appSlug: '', botUserId: '' }, builtIn: false, source: 'user', sortOrder: 0, createdAt: '', updatedAt: ''
}
const TASK: Task = {
  id: 't1', projectId: 'p1', title: 'Palette', prompt: 'Rebuild the palette', status: 'review', priority: 2, seq: 0, scheduledAt: null,
  currentRunId: 'r1', sessionId: 's1', agentOverrideId: null, pendingMessage: '', reservedMessage: '', reviewNote: '', dependsOn: [],
  source: 'user', ruleId: null, externalKey: null, archived: false, createdAt: '', updatedAt: '', doneAt: null
}
const RUN = {
  id: 'r1', taskId: 't1', agentId: 'a1', resolvedFromGroupId: null, sessionId: 's1', kind: 'initial',
  status: 'succeeded', attempt: 1, fallbackFromRunId: null, pid: null, cwd: '/tmp', command: 'claude', args: [],
  promptPreview: 'Rebuild the palette', exitCode: 0, errorKind: null, errorMessage: '', sessionLogPath: null,
  stdoutLogPath: '/tmp/r1.log', source: 'user', externalKey: null, startedAt: '2026-09-28T01:00:00Z', endedAt: '2026-09-28T02:06:00Z'
} satisfies Run
const hook = (id: string, name: string, createdAt: string): HookRun => ({
  id, taskId: 't1', taskTitle: 'Palette', projectId: 'p1', hookId: id, name, event: 'stopped', kind: 'command', status: 'succeeded',
  cwd: '/tmp', input: 'true', agentId: null, createdAt, startedAt: createdAt, endedAt: createdAt, exitCode: 0, error: '', logPath: `/tmp/${id}.log`
})

beforeEach(() => {
  queryClient.clear()
  window.matchMedia = query => ({ matches: true, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })
  vi.stubGlobal('IntersectionObserver', class { observe(): void {} disconnect(): void {} })
  const os = implement(contract)
  Object.defineProperty(window, 'quuu', { configurable: true, value: createRouterClient({
    hooks: { list: os.hooks.list.handler(() => [{ ...hook('late', 'Auto commit', '2026-09-28T02:06:00Z'), event: 'completed' }, hook('early', 'Lint check', '2026-09-28T01:06:00Z')]) },
    report: { get: os.report.get.handler(() => null) }
  }) })
})

afterEach(() => {
  cleanup()
  queryClient.clear()
  vi.unstubAllGlobals()
})

it('shows a hook between the turns it ran between, not under the last one', async () => {
  useStore.setState({ runs: [RUN], selectedRunId: RUN.id, sessionLoading: false, session: {
    sessionId: 's1', logPath: '/tmp/s1.jsonl', exists: true, title: null, messages: MESSAGES, hasMore: false, hasNewer: false,
    totalMessages: MESSAGES.length, first: 0, last: MESSAGES.length, generation: 'g1', indexing: false
  } })
  render(<ThemeProvider colorScheme="dark" buildTheme={buildTheme}><Chat task={TASK} project={PROJECT} /></ThemeProvider>)
  const early = await screen.findByRole('button', { name: /Lint check/ })
  const late = await screen.findByRole('button', { name: /Auto commit/ })
  const follows = (a: Node, b: Node): boolean => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
  await waitFor(() => expect(follows(screen.getByText('Rebuilt it'), early)).toBe(true))
  expect(follows(early, screen.getByText('Align the rules too'))).toBe(true)
  expect(follows(screen.getByText('Aligned them'), late)).toBe(true)
})

it('keeps completed hooks visible when an earlier run opens the same conversation', async () => {
  const earlier = { ...RUN, id: 'earlier', endedAt: '2026-09-28T01:06:00Z' }
  useStore.setState({ runs: [RUN, earlier], selectedRunId: earlier.id, sessionLoading: false, session: {
    sessionId: 's1', logPath: '/tmp/s1.jsonl', exists: true, title: null, messages: MESSAGES, hasMore: false, hasNewer: false,
    totalMessages: MESSAGES.length, first: 0, last: MESSAGES.length, generation: 'g1', indexing: false
  } })
  render(<ThemeProvider colorScheme="dark" buildTheme={buildTheme}><Chat task={{ ...TASK, status: 'done' }} project={PROJECT} /></ThemeProvider>)
  expect(await screen.findByRole('button', { name: /Auto commit/ })).toBeTruthy()
})

it.each(['different-session', ''])('does not move cached hooks into a past run with session %s', (sessionId) => {
  const earlier = { ...RUN, id: 'earlier', sessionId }
  queryClient.setQueryData(['hooks.list', TASK.id, undefined], [hook('late', 'Auto commit', '2026-09-28T02:06:00Z')])
  useStore.setState({ runs: [{ ...RUN, sessionId: sessionId ? RUN.sessionId : '' }, earlier], selectedRunId: earlier.id, sessionLoading: false, session: {
    sessionId: sessionId || 'stdout:earlier', logPath: '/tmp/earlier.jsonl', exists: true, title: null, messages: MESSAGES, hasMore: false, hasNewer: false,
    totalMessages: MESSAGES.length, first: 0, last: MESSAGES.length, generation: 'g1', indexing: false
  } })
  render(<ThemeProvider colorScheme="dark" buildTheme={buildTheme}><Chat task={TASK} project={PROJECT} /></ThemeProvider>)
  expect(screen.getByText('Aligned them')).toBeTruthy()
  expect(screen.queryByRole('button', { name: /Auto commit/ })).toBeNull()
})

it('keeps cached auxiliary execution cards out of QuuuAI conversations', () => {
  queryClient.setQueryData(['hooks.list', TASK.id, undefined], [hook('late', 'Auto commit', '2026-09-28T02:06:00Z')])
  useStore.setState({ runs: [RUN], selectedRunId: RUN.id, sessionLoading: false, session: {
    sessionId: 's1', logPath: '/tmp/s1.jsonl', exists: true, title: null, messages: MESSAGES, hasMore: false, hasNewer: false,
    totalMessages: MESSAGES.length, first: 0, last: MESSAGES.length, generation: 'g1', indexing: false
  } })
  render(<ThemeProvider colorScheme="dark" buildTheme={buildTheme}><Chat task={TASK} project={{ ...PROJECT, builtIn: true }} /></ThemeProvider>)
  expect(screen.getByText('Aligned them')).toBeTruthy()
  expect(screen.queryByRole('button', { name: /Auto commit/ })).toBeNull()
})
