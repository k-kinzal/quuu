// @vitest-environment jsdom
import { ThemeProvider } from '@design-system/react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it } from 'vitest'
import type { Run } from '../src/main/execution/types.js'
import { RunHistory } from '../src/renderer/src/components/RunHistory.js'
import { buildTheme } from '../src/renderer/src/ui/theme.js'

beforeEach(() => {
  window.matchMedia = (query) => ({
    matches: false, media: query, onchange: null,
    addListener: () => undefined, removeListener: () => undefined,
    addEventListener: () => undefined, removeEventListener: () => undefined,
    dispatchEvent: () => false
  })
})

afterEach(cleanup)

function run(id: string, agentId: string, fallbackFromRunId: string | null = null): Run {
  return {
    id, taskId: 'task', agentId, fallbackFromRunId, resolvedFromGroupId: null,
    sessionId: 'session', kind: 'followup', status: 'limited', attempt: 1, pid: null,
    cwd: '/tmp', command: 'claude', args: [], promptPreview: 'continue', exitCode: 1,
    errorKind: 'limit', errorMessage: 'Usage limit', sessionLogPath: null,
    stdoutLogPath: '/tmp/run.log', source: 'user', externalKey: null,
    startedAt: '2026-09-21T00:00:00.000Z', endedAt: '2026-09-21T00:00:01.000Z'
  }
}

function show(runs: Run[]): void {
  render(<ThemeProvider colorScheme="dark" buildTheme={buildTheme}>
    <RunHistory runs={runs} agentNames={new Map([['fable', 'Fable'], ['opus', 'Opus']])}
      selectedRunId={runs[0].id} now={Date.now()} onSelect={() => undefined} onCancel={() => undefined} />
  </ThemeProvider>)
}

it('shows Fable → Opus → Limit when both configured models have been tried', () => {
  show([run('opus-run', 'opus', 'fable-run'), run('fable-run', 'fable')])
  expect(screen.getByText('Fable → Opus → Limit')).toBeTruthy()
})

it('follows handoff IDs and collapses retries on the same model', () => {
  show([
    run('opus-retry', 'opus', 'opus-run'),
    run('unrelated', 'other'),
    run('opus-run', 'opus', 'fable-run'),
    run('fable-run', 'fable')
  ])
  expect(screen.getAllByText('Fable → Opus → Limit')).toHaveLength(2)
  expect(screen.queryByText(/other → Opus/)).toBeNull()
})

it('does not invent a handoff when the referenced run is missing', () => {
  show([run('opus-run', 'opus', 'missing'), run('unrelated', 'fable')])
  expect(screen.queryByText('Fable → Opus → Limit')).toBeNull()
})
