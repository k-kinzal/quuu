// @vitest-environment jsdom
import { createRouterClient, implement } from '@orpc/server'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '../../../packages/design-system/src/theme/ThemeProvider.js'
import type { Project } from '../src/main/projects/types.js'
import type { TaskReport } from '../src/main/report/types.js'
import { DEFAULT_SETTINGS } from '../src/main/settings/types.js'
import type { AppSnapshot } from '../src/main/snapshot.js'
import type { Task } from '../src/main/tasks/types.js'
import { contract } from '../src/preload/contract.js'
import { Inspector } from '../src/renderer/src/components/Inspector.js'
import { queryClient } from '../src/renderer/src/state/queryClient.js'
import { useStore } from '../src/renderer/src/state/store.js'
import { buildTheme } from '../src/renderer/src/ui/theme.js'

/**
 * Whether a report is being written has to be readable **on the row that offers to write one**.
 *
 * The button alone cannot carry it. A label that flips to "writing…" is the easiest thing on a
 * dense pane to miss, and a press that is refused outright leaves such a button exactly as it
 * was — which reads as a press that did nothing. That actually happened.
 */

afterEach(cleanup)

beforeAll(() => {
  window.matchMedia = (query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: () => { }, removeListener: () => { },
    addEventListener: () => { }, removeEventListener: () => { }, dispatchEvent: () => false
  })
})

const PROJECT: Project = {
  id: 'p1', name: 'Quuu', path: '/Users/me/Projects/taskd', color: '#5EABF1', priority: 2,
  targetKind: 'agent', targetId: 'a1', maxConcurrent: 1, enabled: true, deletedAt: null,
  importSince: null, editorApp: '', reportEnabled: true, commitIdentityMode: 'inherit',
  commitIdentity: { appSlug: '', botUserId: '' }, source: 'user', sortOrder: 0,
  createdAt: '', updatedAt: ''
}

const TASK: Task = {
  id: 't1', projectId: 'p1', title: 'Rebuild the color tokens', prompt: '', status: 'done',
  priority: 2, seq: 0, scheduledAt: null, currentRunId: null, sessionId: null,
  agentOverrideId: null, pendingMessage: '', reservedMessage: '', reviewNote: '', dependsOn: [],
  source: 'user', ruleId: null, externalKey: null, archived: false,
  createdAt: '', updatedAt: '', doneAt: null
}

function report(over: Partial<TaskReport> = {}): TaskReport {
  return {
    taskId: 't1', status: 'ready', revision: '', path: '/tmp/reports/t1/a.html',
    logPath: '/tmp/reports/t1/a.log', error: '',
    startedAt: new Date(Date.now() - 20 * 60_000).toISOString(),
    endedAt: new Date(Date.now() - 18 * 60_000).toISOString(),
    ...over
  }
}

const snapshot: AppSnapshot = {
  projects: [PROJECT], tasks: [TASK], rules: [], agents: [], groups: [], runs: [],
  scheduler: {
    running: true, activeRuns: 0, totalSlots: 1, queued: 0, review: 0, failed: 0,
    agents: [], holds: [], warnings: [], lastTickAt: null
  }
}

const get = vi.fn<(id: string) => Promise<TaskReport | null>>()
const generate = vi.fn<(id: string) => Promise<{ ok: boolean; reason?: string }>>()

beforeEach(() => {
  queryClient.clear()
  get.mockReset().mockResolvedValue(null)
  generate.mockReset().mockResolvedValue({ ok: true })
  useStore.setState({
    snapshot, settings: { ...DEFAULT_SETTINGS, reportEnabled: true }, drafts: {},
    detailOpen: true, section: { kind: 'all' }, toasts: [], runs: [], selectedRunId: null
  })
  const os = implement(contract)
  Object.defineProperty(window, 'quuu', {
    configurable: true,
    writable: true,
    value: createRouterClient({
      report: {
        get: os.report.get.handler(({ input }) => get(input)),
        generate: os.report.generate.handler(({ input }) => generate(input))
      },
      runs: { byTask: os.runs.byTask.handler(() => []) }
    })
  })
})

function show(): void {
  render(
    <ThemeProvider colorScheme="dark" buildTheme={buildTheme}>
      <Inspector task={TASK} project={PROJECT} width={320} />
    </ThemeProvider>
  )
}

describe('the report row in the task detail', () => {
  it('offers to write one, and says nothing about a report that does not exist', async () => {
    show()
    await waitFor(() => expect(screen.getByText('Write')).toBeTruthy())
    expect(screen.queryByText(/Written/)).toBeNull()
    expect(screen.queryByText('Writing…')).toBeNull()
  })

  it('says it is being written, and does not offer a second press meanwhile', async () => {
    get.mockResolvedValue(report({ status: 'generating', path: '', endedAt: null }))
    show()
    await waitFor(() => expect(screen.getByText('Writing…')).toBeTruthy())
    // Nothing to press while it is being written, so the row does not offer one
    expect(screen.queryByText('Write again')).toBeNull()
    expect(screen.queryByText('Write')).toBeNull()
  })

  it('offers to write it again once a page exists', async () => {
    get.mockResolvedValue(report())
    show()
    await waitFor(() => expect(screen.getByText('Write again')).toBeTruthy())
  })

  it('says nothing else: whether a report exists is the tab\'s job, not this row\'s', async () => {
    get.mockResolvedValue(report())
    show()
    await waitFor(() => expect(screen.getByText('Write again')).toBeTruthy())
    // A row that also reports the state carries two things where one press is the whole answer
    expect(screen.queryByText(/Written/)).toBeNull()
    expect(screen.queryByText('Writing…')).toBeNull()
  })

  it('still offers a first write after a generation that produced no page', async () => {
    get.mockResolvedValue(report({ status: 'failed', path: '', error: 'the model refused' }))
    show()
    await waitFor(() => expect(screen.getByText('Write')).toBeTruthy())
    // The failure was told when it happened. Left on the row it would outlive it with no action
    expect(screen.queryByText(/Could not/)).toBeNull()
  })

  it('reports a generation that could not start, instead of leaving the press looking ignored', async () => {
    generate.mockResolvedValue({ ok: false, reason: 'No agent is set to write change reports' })
    show()
    await waitFor(() => expect(screen.getByText('Write')).toBeTruthy())
    fireEvent.click(screen.getByText('Write'))
    await waitFor(() =>
      expect(useStore.getState().toasts.map((toast) => toast.detail))
        .toContain('No agent is set to write change reports')
    )
  })

  it('does not let a refused press go on shadowing the report written after it', async () => {
    generate.mockResolvedValue({ ok: false, reason: 'Change reports are turned off' })
    show()
    await waitFor(() => expect(screen.getByText('Write')).toBeTruthy())
    fireEvent.click(screen.getByText('Write'))
    await waitFor(() => expect(useStore.getState().toasts.length).toBe(1))

    // Whatever happens next is the state. A refusal is an event and has already been told
    get.mockResolvedValue(report())
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ['report', 't1'] }) })
    await waitFor(() => expect(screen.getByText('Write again')).toBeTruthy())
    expect(screen.queryByText('Could not be written')).toBeNull()
  })

  it('turns to "being written" once the press lands, without waiting for the next poll', async () => {
    let settle: (value: { ok: boolean }) => void = () => { }
    generate.mockReturnValue(new Promise((resolve) => { settle = resolve }))
    show()
    await waitFor(() => expect(screen.getByText('Write')).toBeTruthy())
    fireEvent.click(screen.getByText('Write'))
    await waitFor(() => expect(screen.getByText('Writing…')).toBeTruthy())
    settle({ ok: true })
  })
})
