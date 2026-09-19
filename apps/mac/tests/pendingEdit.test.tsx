// @vitest-environment jsdom
import { createRouterClient, implement, ORPCError } from '@orpc/server'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '../../../packages/design-system/src/theme/ThemeProvider.js'
import type { Task } from '../src/main/tasks/types.js'
import { contract } from '../src/preload/contract.js'
import { PendingTurn } from '../src/renderer/src/components/PendingTurn.js'
import { queryClient } from '../src/renderer/src/state/queryClient.js'
import { buildTheme } from '../src/renderer/src/ui/theme.js'

/**
 * Instructions not yet sent **can be edited**.
 *
 * Never a state where the UI says "editable" but there is no entry point to edit.
 * Rendering the body as a bare input is indistinguishable from a quote, so we
 * check that an explicit entry point ("Edit") and, while writing, "Save" and
 * "Revert" appear **as pressable controls** (rule Q: a key hint is no substitute).
 */

afterEach(() => { cleanup(); queryClient.clear(); vi.restoreAllMocks() })

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

function task(over: Partial<Task> = {}): Task {
  return {
    id: 't1',
    projectId: 'p1',
    title: 'タイトル',
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

function show(over: Partial<Task> = {}): { update: ReturnType<typeof vi.fn> } {
  const update = vi.fn((input: { patch: Partial<Task> }) => ({ ...task(over), ...input.patch }))
  const client = createRouterClient({ tasks: { update: implement(contract.tasks.update).handler(({ input }) => update(input)) } })
  Object.defineProperty(window, 'quuu', { configurable: true, writable: true, value: client })
  const t = task(over)
  render(
    <ThemeProvider colorScheme="dark" buildTheme={buildTheme}>
      <PendingTurn task={t} next={{ field: 'prompt', value: t.prompt }} />
    </ThemeProvider>
  )
  return { update }
}

describe('instructions not yet sent', () => {
  it('shows an entry point to edit (not something you only discover by touching)', () => {
    show()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy()
  })

  it('"Edit" focuses the body, with the caret placed at the end', () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))

    const body = screen.getByLabelText<HTMLTextAreaElement>('Instructions to send on the next run')
    expect(document.activeElement).toBe(body)
    expect(body.selectionStart).toBe('最初の指示'.length)
  })

  it('while writing, save and discard appear as pressable controls (a key hint is no substitute)', () => {
    show()
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()

    fireEvent.focus(screen.getByLabelText('Instructions to send on the next run'))
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Revert' })).toBeTruthy()
    // Don't also show "Edit" while writing
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
  })

  it('"Save" commits the rewritten instructions', async () => {
    const { update } = show()
    const body = screen.getByLabelText<HTMLTextAreaElement>('Instructions to send on the next run')

    body.focus()
    fireEvent.change(body, { target: { value: '書き直した指示' } })
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    })

    await waitFor(() => expect(update).toHaveBeenCalledWith({ id: 't1', patch: { prompt: '書き直した指示' } }))
  })

  it('"Revert" discards the draft (without making it look lost)', () => {
    const { update } = show()
    const body = screen.getByLabelText<HTMLTextAreaElement>('Instructions to send on the next run')

    body.focus()
    fireEvent.change(body, { target: { value: '書きかけ' } })
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Revert' }))
    })

    expect(update).not.toHaveBeenCalled()
    expect(body.value).toBe('最初の指示')
  })

  it('⌘↵ commits the rewritten instructions (replacing, not appending)', async () => {
    const { update } = show()
    const body = screen.getByLabelText<HTMLTextAreaElement>('Instructions to send on the next run')

    // Committing runs when focus leaves the surface (keys are funneled into the single blur path)
    body.focus()
    fireEvent.change(body, { target: { value: '書き直した指示' } })
    act(() => {
      fireEvent.keyDown(body, { key: 'Enter', metaKey: true })
    })

    await waitFor(() => expect(update).toHaveBeenCalledWith({ id: 't1', patch: { prompt: '書き直した指示' } }))
  })

  it('shows a save failure defined by the contract, keeps the body, and lets the save button retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { update } = show()
    update.mockImplementationOnce(() => { throw new ORPCError('OPERATION_FAILED', { data: { reason: '保存先に書き込めません' } }) })
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const body = screen.getByLabelText<HTMLTextAreaElement>('Instructions to send on the next run')
    fireEvent.change(body, { target: { value: '書き直した指示' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('保存先に書き込めません')
    expect(body.value).toBe('書き直した指示')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.queryByText('Could not save changes')).toBeNull())
    expect(update).toHaveBeenCalledTimes(2)
  })

  it('Esc discards the draft (without making it look lost)', () => {
    const { update } = show()
    const body = screen.getByLabelText<HTMLTextAreaElement>('Instructions to send on the next run')

    body.focus()
    fireEvent.change(body, { target: { value: '書きかけ' } })
    act(() => {
      fireEvent.keyDown(body, { key: 'Escape' })
    })

    expect(update).not.toHaveBeenCalled()
    expect(body.value).toBe('最初の指示')
  })
})
