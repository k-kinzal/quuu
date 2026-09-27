// @vitest-environment jsdom
import { createRouterClient, implement } from '@orpc/server'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '../../../packages/design-system/src/theme/ThemeProvider.js'
import { DEFAULT_SETTINGS } from '../src/main/settings/types.js'
import type { ProjectReport } from '../src/api/schemas/report.js'
import { ProjectSchema } from '../src/api/schemas/projects.js'
import { contract } from '../src/api/contract.js'
import { INITIAL_PLACE, INITIAL_TRAIL } from '../src/renderer/src/state/navigation.js'
import { queryClient } from '../src/renderer/src/state/queryClient.js'
import { useStore } from '../src/renderer/src/state/store.js'
import { ProjectNavigation } from '../src/renderer/src/views/project/ProjectNavigation.js'
import { ProjectDashboard } from '../src/renderer/src/views/project/ProjectDashboard.js'
import { ReportSettings } from '../src/renderer/src/views/settings/ReportSettings.js'

const project = ProjectSchema.parse({
  id: 'p1', name: 'Project', path: '/tmp/project', color: '#123456', priority: 2,
  targetKind: 'agent', targetId: null, maxConcurrent: 1, enabled: true, deletedAt: null,
  importSince: null, editorApp: '', reportEnabled: true, commitIdentityMode: 'inherit',
  pullRequestPromptMode: 'inherit', pullRequestFailurePrompt: '', pullRequestPendingPrompt: '', pullRequestConflictPrompt: '', pullRequestFailureEnabled: false, pullRequestPendingEnabled: false, pullRequestConflictEnabled: false,
  commitIdentity: { appSlug: '', botUserId: '' }, source: 'user', sortOrder: 0, createdAt: '', updatedAt: ''
})
const get = vi.fn<() => Promise<ProjectReport | null>>()
const generate = vi.fn(() => Promise.resolve({ ok: true }))
const show = vi.fn(() => Promise.resolve({ ok: true }))
const hide = vi.fn(() => Promise.resolve({ ok: true }))
const save = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  queryClient.clear()
  get.mockResolvedValue(null)
  useStore.setState({ ...INITIAL_PLACE, section: { kind: 'project', id: project.id }, trail: INITIAL_TRAIL,
    settings: { ...DEFAULT_SETTINGS, reportEnabled: true }, selectedRunId: null, paletteOpen: false,
    snapshot: { projects: [project], tasks: [], rules: [], runs: [], agents: [], groups: [],
      scheduler: { running: false, activeRuns: 0, totalSlots: 1, queued: 0, review: 0, failed: 0,
        agents: [], holds: [], warnings: [], lastTickAt: null } } })
  window.matchMedia = (query) => ({ matches: false, media: query, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ x: 100, y: 50, left: 100, top: 50,
    right: 900, bottom: 650, width: 800, height: 600, toJSON: () => ({}) })
  const os = implement(contract)
  Object.defineProperty(window, 'quuu', { configurable: true, writable: true, value: createRouterClient({
    report: {
      projectGet: os.report.projectGet.handler(() => get()),
      projectGenerate: os.report.projectGenerate.handler(() => generate()),
      projectShow: os.report.projectShow.handler(() => show()),
      hide: os.report.hide.handler(() => hide())
    },
    settings: { set: os.settings.set.handler(({ input }) => { save(input); return { ...useStore.getState().settings!, ...input } }) },
    session: { close: os.session.close.handler(() => undefined) }
  }) })
})
afterEach(() => { cleanup(); queryClient.clear(); vi.restoreAllMocks() })

describe('project navigation and dashboard', () => {
  it('navigates between the three destinations and restores them with back and forward', async () => {
    render(<ThemeProvider><ProjectNavigation project={project} /></ThemeProvider>)
    const nav = screen.getByRole('navigation', { name: 'Project navigation' })
    expect(nav.querySelectorAll('button')).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }))
    expect(useStore.getState()).toMatchObject({ projectDashboardOpen: true, projectSettingsOpen: false, detailOpen: false })
    fireEvent.click(screen.getByRole('button', { name: 'Project Settings' }))
    expect(useStore.getState()).toMatchObject({ projectDashboardOpen: false, projectSettingsOpen: true })
    fireEvent.click(screen.getByRole('button', { name: 'Tasks' }))
    expect(useStore.getState()).toMatchObject({ projectDashboardOpen: false, projectSettingsOpen: false })
    await act(() => useStore.getState().goBack())
    expect(useStore.getState().projectSettingsOpen).toBe(true)
    await act(() => useStore.getState().goBack())
    expect(useStore.getState().projectDashboardOpen).toBe(true)
    await act(() => useStore.getState().goForward())
    expect(useStore.getState().projectSettingsOpen).toBe(true)
  })

  it('hides the dashboard when report AI or the project report setting is off', () => {
    const view = render(<ThemeProvider><ProjectNavigation project={project} /></ThemeProvider>)
    act(() => useStore.setState({ settings: { ...DEFAULT_SETTINGS, reportEnabled: false } }))
    expect(screen.queryByRole('button', { name: 'Dashboard' })).toBeNull()
    act(() => useStore.setState({ settings: { ...DEFAULT_SETTINGS, reportEnabled: true } }))
    view.rerender(<ThemeProvider><ProjectNavigation project={{ ...project, reportEnabled: false }} /></ThemeProvider>)
    expect(screen.queryByRole('button', { name: 'Dashboard' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Tasks' })).toBeTruthy()
  })

  it('leaves an absent report empty and offers regeneration in the header', async () => {
    render(<ThemeProvider><ProjectDashboard project={project} /></ThemeProvider>)
    await waitFor(() => expect(get).toHaveBeenCalled())
    expect(screen.queryByLabelText('Project report')).toBeNull()
    expect(show).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Project Settings' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate report' }))
    await waitFor(() => expect(generate).toHaveBeenCalledOnce())
  })

  it('keeps the previous report visible during generation and hides its native view on leaving', async () => {
    get.mockResolvedValue({ projectId: project.id, status: 'generating', path: '/tmp/previous.html',
      revision: 'previous', logPath: '', error: '', startedAt: '', endedAt: null })
    const view = render(<ThemeProvider><ProjectDashboard project={project} /></ThemeProvider>)
    await waitFor(() => expect(show).toHaveBeenCalled())
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Generating report…' }).disabled).toBe(true)
    act(() => useStore.setState({ paletteOpen: true }))
    await waitFor(() => expect(hide).toHaveBeenCalled())
    view.unmount()
  })

  it('saves the project report purpose independently of task report instructions', async () => {
    render(<ThemeProvider><ReportSettings /></ThemeProvider>)
    fireEvent.change(screen.getByPlaceholderText(/Assess progress toward/), { target: { value: 'Focus on usability' } })
    await waitFor(() => expect(save).toHaveBeenCalledWith({ projectReportInstructions: 'Focus on usability' }))
    await waitFor(() => expect(useStore.getState().settings?.projectReportInstructions).toBe('Focus on usability'))
    expect(useStore.getState().settings?.reportInstructions).toBe('')
  })
})
