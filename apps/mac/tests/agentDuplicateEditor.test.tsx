// @vitest-environment jsdom
import { createRouterClient, implement } from '@orpc/server'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { ThemeProvider } from '../../../packages/design-system/src/theme/ThemeProvider.js'
import { DEFAULT_SETTINGS } from '../src/main/settings/types.js'
import type { AppSnapshot } from '../src/main/snapshot.js'
import type { Agent, AgentInput } from '../src/preload/api.js'
import { contract } from '../src/preload/contract.js'
import { useStore } from '../src/renderer/src/state/store.js'
import { buildTheme } from '../src/renderer/src/ui/theme.js'
import { AgentSettings } from '../src/renderer/src/views/settings/AgentSettings.js'

/**
 * Duplicating from the editor.
 *
 * The right-click item on the list row was the only way to copy an agent, and a right-click
 * is found by luck. Someone setting up "the same CLI, another model" is standing in the
 * editor of the agent they want to copy, so the action has to be there too.
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

const OPUS: Agent = {
  id: 'a1',
  name: 'Claude',
  description: '',
  command: 'claude',
  argsTemplate: ['-p', '--model', 'opus', '--', '{{prompt}}'],
  resumeArgsTemplate: ['--resume', '{{sessionId}}', '-p', '--', '{{prompt}}'],
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

const SNAPSHOT: AppSnapshot = {
  projects: [],
  tasks: [],
  rules: [],
  agents: [OPUS],
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

let duplicate: Mock<(id: string) => Agent>
let update: Mock<(input: { id: string; patch: Partial<AgentInput> }) => Agent>

beforeEach(() => {
  useStore.setState({
    settings: structuredClone(DEFAULT_SETTINGS),
    snapshot: SNAPSHOT,
    editingAgentId: OPUS.id,
    editingGroupId: null
  })
  duplicate = vi.fn((id) => ({ ...OPUS, id: 'a2', name: 'Claude copy', enabled: false, sortOrder: 1, fallbackAgentId: id === OPUS.id ? null : id }))
  update = vi.fn((input) => ({ ...OPUS, ...input.patch }))
  const os = implement(contract)
  const client = createRouterClient({
    agents: {
      defaults: os.agents.defaults.handler(() => ({ limitPatterns: [] })),
      duplicate: os.agents.duplicate.handler(({ input }) => duplicate(input)),
      update: os.agents.update.handler(({ input }) => update(input))
    }
  })
  Object.defineProperty(window, 'quuu', { configurable: true, writable: true, value: client })
})

function show(): void {
  render(
    <ThemeProvider colorScheme="dark" buildTheme={buildTheme}>
      <AgentSettings />
    </ThemeProvider>
  )
}

describe('duplicating from the agent editor', () => {
  it('offers Duplicate next to Save and Delete', () => {
    show()
    expect(screen.getByRole('button', { name: 'Duplicate' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Saved' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy()
  })

  it('asks main for the copy and moves on to editing it', async () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }))

    await waitFor(() => expect(useStore.getState().editingAgentId).toBe('a2'))
    expect(duplicate).toHaveBeenCalledWith('a1')
    // Nothing was changed on the original: the copy is main's to make, not the screen's
    expect(update).not.toHaveBeenCalled()
  })

  it('saves unsaved edits before copying, so the copy is what is on screen', async () => {
    show()
    fireEvent.change(screen.getByDisplayValue('Claude'), { target: { value: 'Claude Opus' } })
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }))

    await waitFor(() => expect(useStore.getState().editingAgentId).toBe('a2'))
    expect(update).toHaveBeenCalledOnce()
    expect(update.mock.calls[0][0]).toMatchObject({ id: 'a1', patch: { name: 'Claude Opus' } })
    expect(duplicate).toHaveBeenCalledWith('a1')
    // The save happened before the copy was asked for, or the copy would miss the edit
    expect(update.mock.invocationCallOrder[0]).toBeLessThan(duplicate.mock.invocationCallOrder[0])
  })
})
