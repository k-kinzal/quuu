// @vitest-environment jsdom
import { createRouterClient, implement } from '@orpc/server'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '../../../packages/design-system/src/theme/ThemeProvider.js'
import { DEFAULT_SETTINGS } from '../src/main/settings/types.js'
import type { AppSnapshot } from '../src/main/snapshot.js'
import type { Agent, AgentGroup, AgentGroupInput } from '../src/preload/api.js'
import { contract } from '../src/preload/contract.js'
import { useStore } from '../src/renderer/src/state/store.js'
import { buildTheme } from '../src/renderer/src/ui/theme.js'
import { AgentSettings } from '../src/renderer/src/views/settings/AgentSettings.js'

/**
 * Marking a group as the default from Settings > Agents.
 *
 * The mark is a property of the group, so it is set where the group is edited and read
 * off the list where the groups are compared. It takes effect on Save like the rest of
 * the group (a checkbox, not a switch).
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

const CLAUDE: Agent = {
  id: 'a1',
  name: 'Claude',
  description: '',
  command: 'claude',
  argsTemplate: ['-p', '--', '{{prompt}}'],
  resumeArgsTemplate: [],
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

const EVERYDAY: AgentGroup = {
  id: 'g1',
  name: 'Everyday',
  description: '',
  strategy: 'priority',
  memberIds: ['a1'],
  isDefault: false,
  sortOrder: 0,
  createdAt: '',
  updatedAt: ''
}

const WEEKEND: AgentGroup = { ...EVERYDAY, id: 'g2', name: 'Weekend', isDefault: true, sortOrder: 1 }

function snapshot(groups: AgentGroup[]): AppSnapshot {
  return {
    projects: [],
    tasks: [],
    rules: [],
    agents: [CLAUDE],
    groups,
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
}

const update = vi.fn((input: { id: string; patch: Partial<AgentGroupInput> }): AgentGroup => ({ ...EVERYDAY, ...input.patch }))

beforeEach(() => {
  useStore.setState({
    settings: structuredClone(DEFAULT_SETTINGS),
    snapshot: snapshot([EVERYDAY, WEEKEND]),
    editingAgentId: null,
    editingGroupId: null
  })
  update.mockClear()
  const os = implement(contract)
  const client = createRouterClient({
    groups: { update: os.groups.update.handler(({ input }) => update(input)) }
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

describe('the default group in settings', () => {
  it('is pointed out on the list, and only there where it applies', () => {
    show()
    const marks = screen.getAllByText(/· Default$/)
    expect(marks).toHaveLength(1)
    expect(marks[0].closest('tr')?.textContent).toContain('Weekend')
  })

  it('is set from the group editor and saved with the rest of the group', async () => {
    useStore.setState({ editingGroupId: EVERYDAY.id })
    show()
    const box = screen.getByLabelText<HTMLInputElement>('Use for new projects')
    expect(box.checked).toBe(false)

    fireEvent.click(box)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(update).toHaveBeenCalledOnce())
    expect(update.mock.calls[0][0]).toMatchObject({ id: 'g1', patch: { isDefault: true } })
  })

  it('shows the mark already on the group that carries it', () => {
    useStore.setState({ editingGroupId: WEEKEND.id })
    show()
    expect(screen.getByLabelText<HTMLInputElement>('Use for new projects').checked).toBe(true)
  })
})
