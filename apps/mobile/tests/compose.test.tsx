// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ThemeProvider } from '@design-system/react'
import { buildTheme } from '../src/ui/theme.js'
import type { SyncProject } from '../src/sync/protocol.js'
import { ComposeView } from '../src/views/ComposeView.js'
import { useStore } from '../src/state/store.js'

/**
 * How the queuing surface is assembled. Watches that **options are never laid out on
 * the surface**.
 *
 * Back when projects sat in a horizontal bar (`SegmentedControl`), neither their names
 * nor their count was fixed, so they overflowed the screen, names overlapped, and none
 * could be pressed. What is pinned here is the shape itself - **only what is currently
 * chosen appears on the surface**, and the options line up only inside the surface a
 * press raises (`Sheet`).
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

function project(id: string, name: string): SyncProject {
  return { id, name, color: '#4EA8DE', priority: 2, enabled: true }
}

const PROJECTS = [
  project('p1', 'Quuu'),
  project('p2', 'とてつもなく名前が長いプロジェクト（社内の正式名称そのまま）'),
  project('p3', 'taskd'),
  project('p4', 'design-system'),
  project('p5', 'infra-monitoring'),
  project('p6', 'mobile')
]

function show(projects: SyncProject[]): void {
  useStore.setState({
    view: { ...useStore.getState().view, projects },
    drafts: {},
    busy: false
  })
  render(
    <ThemeProvider colorScheme="dark" density="comfortable" buildTheme={buildTheme}>
      <ComposeView footer={<></>} />
    </ThemeProvider>
  )
}

describe('the new task surface', () => {
  it('never lays project options out on the surface, showing only what is currently chosen', () => {
    show(PROJECTS)

    expect(screen.getAllByText('Quuu').length).toBe(1)
    for (const p of PROJECTS.slice(1)) {
      expect(screen.queryByText(p.name)).toBeNull()
    }
  })

  it('raises the choosing surface on press, and the row then states what was chosen', async () => {
    show(PROJECTS)

    fireEvent.click(screen.getByText('Project'))
    // Only here do the options line up (vertically, at a pressable size)
    for (const p of PROJECTS) expect(screen.getAllByText(p.name).length).toBeGreaterThan(0)

    fireEvent.click(screen.getByText('infra-monitoring'))
    await waitFor(() => {
      // After the surface closes, the row still states what was chosen
      expect(screen.queryByText('mobile')).toBeNull()
      expect(screen.getAllByText('infra-monitoring').length).toBe(1)
    })
  })

  it('priority takes the same shape: one value on the surface until something is chosen', async () => {
    show(PROJECTS)

    expect(screen.queryByText('P0')).toBeNull()
    fireEvent.click(screen.getByText('Priority'))
    fireEvent.click(screen.getByText('P0'))
    await waitFor(() => {
      expect(screen.queryByText('P3')).toBeNull()
      expect(screen.getAllByText('P0').length).toBe(1)
    })
  })

  it('is not pressable with only one project, since opening would offer nothing to choose', () => {
    show([project('p1', 'Quuu')])

    const row = screen.getByText('Project').closest('button')
    expect(row).toBeNull()
    // The row still shows: where it will be queued should be readable before writing
    expect(screen.getByText('Quuu')).toBeTruthy()
  })

  it('picks how to add from the bottom, and the primary button states the choice', async () => {
    const createTask = vi.fn().mockResolvedValue(undefined)
    useStore.setState({ createTask })
    show(PROJECTS)

    expect(screen.getByRole('button', { name: 'Add' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'How to add' }))

    for (const label of ['Add as draft', 'Add held', 'Add', 'Run now']) {
      expect(screen.getAllByRole('button', { name: label }).length).toBeGreaterThan(0)
    }

    fireEvent.click(screen.getByRole('button', { name: 'Add held' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add held' })).toBeTruthy()
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    fireEvent.change(screen.getByPlaceholderText('Task name'), {
      target: { value: 'あとでやること' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add held' }))
    await waitFor(() => {
      expect(createTask).toHaveBeenCalledWith({
        projectId: 'p1',
        title: 'あとでやること',
        prompt: '',
        priority: 2,
        action: 'held'
      })
      expect(screen.getByPlaceholderText<HTMLInputElement>('Task name').value).toBe('')
    })
  })

  it('keeps the input when the device write fails, and shows the reason in place', async () => {
    const createTask = vi.fn().mockRejectedValue(new Error('iCloud へ書けませんでした'))
    useStore.setState({ createTask })
    show(PROJECTS)

    fireEvent.change(screen.getByPlaceholderText('Task name'), {
      target: { value: '失いたくない名前' }
    })
    fireEvent.change(screen.getByPlaceholderText('Instructions for the agent...'), {
      target: { value: '失いたくない指示' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => {
      expect(screen.getByText("Couldn't add")).toBeTruthy()
      expect(screen.getByText('iCloud へ書けませんでした')).toBeTruthy()
    })
    expect(screen.getByPlaceholderText<HTMLInputElement>('Task name').value).toBe(
      '失いたくない名前'
    )
    expect(
      screen.getByPlaceholderText<HTMLTextAreaElement>('Instructions for the agent...').value
    ).toBe('失いたくない指示')
  })
})
