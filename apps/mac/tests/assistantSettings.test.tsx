// @vitest-environment jsdom
import { createRouterClient, implement } from '@orpc/server'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ThemeProvider } from '@design-system/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { contract } from '../src/api/contract.js'
import { AssistantSettings } from '../src/renderer/src/views/settings/AssistantSettings.js'
import { t } from '../src/renderer/src/model/i18n/index.js'
import { queryClient } from '../src/renderer/src/state/queryClient.js'
import { useStore } from '../src/renderer/src/state/store.js'
import { buildTheme } from '../src/renderer/src/ui/theme.js'

const confirm = vi.fn<() => Promise<boolean>>()
const reset = vi.fn<() => string[]>()
const close = vi.fn()
let content: string
beforeEach(() => {
  window.matchMedia = query => ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })
  content = 'Debug memory'
  confirm.mockReset().mockResolvedValue(false)
  reset.mockReset().mockImplementation(() => { content = ''; return ['thread', 'archived'] })
  close.mockReset()
  useStore.setState({ snapshot: null, drafts: { 'assistant-channel': 'Debug message', 'task:thread': 'Debug reply', 'task:archived': 'Old reply', 'task:project': 'Keep this' }, cursorTaskId: 'thread', closeDetail: close })
  const os = implement(contract)
  window.quuu = createRouterClient({
    system: { confirm: os.system.confirm.handler(() => confirm()) },
    assistant: {
      state: os.assistant.state.handler(() => ({ settings: { enabled: false, intervalHours: 6, confidenceThreshold: 70 }, activity: 'off', lastCheckAt: null, nextCheckAt: null, error: null, unread: false, threads: [], proposals: [] })),
      memory: os.assistant.memory.handler(() => ({ content, revision: content, bytes: content.length, maxBytes: 16384 })),
      reset: os.assistant.reset.handler(() => reset())
    }
  }) as typeof window.quuu
})
afterEach(() => { cleanup(); queryClient.clear(); vi.restoreAllMocks() })
async function show(): Promise<void> {
  render(<ThemeProvider colorScheme="dark" buildTheme={buildTheme}><AssistantSettings /></ThemeProvider>)
  await screen.findByDisplayValue('Debug memory')
}

it('leaves memory, drafts and conversations intact when the native confirmation is canceled', async () => {
  await show()
  fireEvent.click(screen.getByRole('button', { name: t('quuuAI.reset') }))
  await waitFor(() => expect(confirm).toHaveBeenCalledOnce())
  await waitFor(() => expect(screen.getByRole<HTMLButtonElement>('button', { name: t('quuuAI.reset') }).disabled).toBe(false))
  expect(reset).not.toHaveBeenCalled()
  expect(screen.getByDisplayValue('Debug memory')).toBeTruthy()
  expect(useStore.getState().drafts['assistant-channel']).toBe('Debug message')
  expect(close).not.toHaveBeenCalled()
})

it('clears the memory editor and only assistant drafts after a confirmed reset', async () => {
  confirm.mockResolvedValue(true)
  await show()
  fireEvent.change(screen.getByDisplayValue('Debug memory'), { target: { value: 'Unsaved debug memory' } })
  fireEvent.click(screen.getByRole('button', { name: t('quuuAI.reset') }))
  await screen.findByText(t('quuuAI.resetDone'))
  expect(reset).toHaveBeenCalledOnce()
  expect(screen.queryByDisplayValue('Unsaved debug memory')).toBeNull()
  expect(screen.getByRole<HTMLTextAreaElement>('textbox').value).toBe('')
  expect(useStore.getState().drafts).toEqual({ 'task:project': 'Keep this' })
  expect(close).toHaveBeenCalledOnce()
  expect(screen.getByRole<HTMLButtonElement>('button', { name: t('quuuAI.saveMemory') }).disabled).toBe(true)
})

it('keeps the editor and drafts available when an active conversation blocks reset', async () => {
  confirm.mockResolvedValue(true)
  reset.mockImplementation(() => { throw new Error('Wait for conversations to finish.') })
  await show()
  fireEvent.change(screen.getByDisplayValue('Debug memory'), { target: { value: 'Unsaved memory' } })
  fireEvent.click(screen.getByRole('button', { name: t('quuuAI.reset') }))
  await screen.findByText(/Wait for conversations/)
  expect(screen.getByDisplayValue('Unsaved memory')).toBeTruthy()
  expect(useStore.getState().drafts['task:thread']).toBe('Debug reply')
  expect(close).not.toHaveBeenCalled()
})
