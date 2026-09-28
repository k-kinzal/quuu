// @vitest-environment jsdom
import { createRouterClient, implement } from '@orpc/server'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '../../../packages/design-system/src/theme/ThemeProvider.js'
import { SearchPicker } from '../../../packages/design-system/src/components/surfaces/SearchPicker.js'
import { DEFAULT_SETTINGS } from '../src/main/settings/types.js'
import type { ProjectReport } from '../src/api/schemas/report.js'
import { ProjectSchema } from '../src/api/schemas/projects.js'
import { contract } from '../src/api/contract.js'
import { INITIAL_PLACE, INITIAL_TRAIL } from '../src/renderer/src/state/navigation.js'
import { queryClient } from '../src/renderer/src/state/queryClient.js'
import { useStore } from '../src/renderer/src/state/store.js'
import { ProjectNavigation } from '../src/renderer/src/views/project/ProjectNavigation.js'
import { ProjectDashboard } from '../src/renderer/src/views/project/ProjectDashboard.js'
import { ProjectDocuments } from '../src/renderer/src/views/project/ProjectDocuments.js'
import { ReportSettings } from '../src/renderer/src/views/settings/ReportSettings.js'
import { DocumentWebsite } from '../src/renderer/src/components/DocumentWebsite.js'
import { ReportPage } from '../src/renderer/src/components/ReportPage.js'

const project = ProjectSchema.parse({
  id: 'p1', name: 'Project', path: '/tmp/project', color: '#123456', priority: 2,
  targetKind: 'agent', targetId: null, maxConcurrent: 1, enabled: true, deletedAt: null,
  importSince: null, editorApp: '', reportEnabled: true, commitIdentityMode: 'inherit', worktreeMode: 'inherit', taskHooks: [],
  pullRequestPromptMode: 'inherit', pullRequestFailurePrompt: '', pullRequestPendingPrompt: '', pullRequestConflictPrompt: '', pullRequestFailureEnabled: false, pullRequestPendingEnabled: false, pullRequestConflictEnabled: false,
  commitIdentity: { appSlug: '', botUserId: '' }, source: 'user', builtIn: false, sortOrder: 0, createdAt: '', updatedAt: ''
})
const get = vi.fn<() => Promise<ProjectReport | null>>()
const generate = vi.fn(() => Promise.resolve({ ok: true }))
const show = vi.fn(() => Promise.resolve({ ok: true }))
const hide = vi.fn(() => Promise.resolve({ ok: true }))
const save = vi.fn()
const listDocuments = vi.fn(() => Promise.resolve({ branch: 'main', revision: 'a'.repeat(40),
  files: [{ path: 'README.md', format: 'markdown' as const }, { path: 'docs/guide.md', format: 'markdown' as const }],
  websites: [{ title: 'Docs', url: 'https://example.com/docs/' }] }))
const readDocument = vi.fn((path: string) => Promise.resolve({ content: path === 'README.md' ? '# Read me\n\n[Guide](docs/guide.md#install)' : '# Install\n\nUse this guide.',
  format: 'markdown' as const, baseUrl: `https://quuu.invalid/${path}` }))

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
    documents: {
      list: os.documents.list.handler(() => listDocuments()),
      read: os.documents.read.handler(({ input }) => readDocument(input.path)),
      show: os.documents.show.handler(() => show()), hide: os.documents.hide.handler(() => hide()),
      navigate: os.documents.navigate.handler(() => undefined)
    },
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
  it.each(['documents', 'report'] as const)('lets the composer picker cover %s and restores the page when it closes', async surface => {
    const onError = vi.fn()
    const content = surface === 'documents'
      ? <DocumentWebsite projectId={project.id} url="https://example.com/docs/" reload={false} onError={onError} />
      : <ReportPage projectId={project.id} path="/tmp/report.html" onError={onError} />
    const renderPage = (open: boolean): JSX.Element => <ThemeProvider>
      <div role="listbox" aria-label="Tasks" />
      {content}
      <SearchPicker open={open} anchorEl={document.body} label="Choose AI" options={[{ value: 'ai', label: 'Project AI' }]}
        value="ai" onChange={() => undefined} onClose={() => undefined} />
    </ThemeProvider>
    const view = render(renderPage(false))
    await waitFor(() => expect(show).toHaveBeenCalled())
    expect(hide).not.toHaveBeenCalled()
    view.rerender(renderPage(true))
    await waitFor(() => expect(hide).toHaveBeenCalled())
    const calls = show.mock.calls.length
    fireEvent.change(screen.getByRole('combobox', { name: 'Choose AI' }), { target: { value: 'No match' } })
    expect(screen.queryByRole('option')).toBeNull()
    expect(show.mock.calls).toHaveLength(calls)
    view.rerender(renderPage(false))
    await waitFor(() => expect(show.mock.calls.length).toBeGreaterThan(calls))
    expect(onError).not.toHaveBeenCalled()
  })

  it('navigates between project destinations and restores them with back and forward', async () => {
    render(<ThemeProvider><ProjectNavigation project={project} /></ThemeProvider>)
    const nav = screen.getByRole('navigation', { name: 'Project navigation' })
    expect(nav.querySelectorAll('button')).toHaveLength(4)
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

  it('keeps Documents independent of report settings and restores it after leaving for Tasks', async () => {
    useStore.setState({ settings: { ...DEFAULT_SETTINGS, reportEnabled: false } })
    render(<ThemeProvider><ProjectNavigation project={project} /></ThemeProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Documents' }))
    expect(useStore.getState()).toMatchObject({ projectDocumentsOpen: true, projectDashboardOpen: false, projectSettingsOpen: false })
    fireEvent.click(screen.getByRole('button', { name: 'Tasks' }))
    expect(useStore.getState().projectDocumentsOpen).toBe(false)
    await act(() => useStore.getState().goBack())
    expect(useStore.getState().projectDocumentsOpen).toBe(true)
  })

  it('reads relative document links, filters the navigation and hides a website when returning to a file', async () => {
    HTMLElement.prototype.scrollIntoView = vi.fn()
    render(<ThemeProvider><ProjectDocuments project={project} /></ThemeProvider>)
    await screen.findByRole('heading', { name: 'Read me' })
    fireEvent.click(screen.getByRole('link', { name: 'Guide' }))
    await screen.findByRole('heading', { name: 'Install' })
    expect(readDocument).toHaveBeenLastCalledWith('docs/guide.md')
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find a document…' }), { target: { value: 'guide' } })
    expect(screen.queryByRole('button', { name: 'README.md' })).toBeNull()
    expect(screen.getByRole('button', { name: 'docs/guide.md' })).toBeTruthy()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find a document…' }), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /Docs/ }))
    await waitFor(() => expect(show).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'README.md' }))
    await waitFor(() => expect(hide).toHaveBeenCalled())
    await screen.findByRole('heading', { name: 'Read me' })
  })

  it('shows file names with parent folders while selecting and searching by the full path', async () => {
    listDocuments.mockResolvedValueOnce({ branch: 'main', revision: 'a'.repeat(40), websites: [], files: [
      { path: 'README.md', format: 'markdown' },
      { path: 'packages/parser/README.md', format: 'markdown' },
      { path: 'packages/query/README.md', format: 'markdown' }
    ] })
    render(<ThemeProvider><ProjectDocuments project={{ ...project, id: 'file-labels' }} /></ThemeProvider>)
    const parser = await screen.findByRole('button', { name: 'packages/parser/README.md' })
    expect(within(parser).getByText('README.md')).toBeTruthy()
    expect(within(parser).getByText('packages/parser')).toBeTruthy()
    expect(parser.getAttribute('title')).toBe('packages/parser/README.md')
    fireEvent.click(screen.getByRole('button', { name: 'packages/query/README.md' }))
    await waitFor(() => expect(readDocument).toHaveBeenLastCalledWith('packages/query/README.md'))
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'packages/parser' } })
    expect(screen.getByRole('button', { name: 'packages/parser/README.md' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'packages/query/README.md' })).toBeNull()
  })

  it('uses the hostname as site context while retaining full URLs for search and tooltips', async () => {
    const title = 'sql-semantics-mysql · SQL Semantics'
    const url = 'https://example.com/project/packages/sql-semantics-mysql/docs/'
    listDocuments.mockResolvedValueOnce({ branch: 'main', revision: 'a'.repeat(40), files: [], websites: [
      { title, url }, { title, url: 'https://reference.example.org/docs/' }
    ] })
    render(<ThemeProvider><ProjectDocuments project={{ ...project, id: 'site-labels' }} /></ThemeProvider>)
    const site = await screen.findByRole('button', { name: `${title} example.com` })
    expect(within(site).getByText(title)).toBeTruthy()
    expect(site.getAttribute('title')).toBe(url)
    expect(screen.queryByText('/project/packages/sql-semantics-mysql/docs/')).toBeNull()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '/packages/sql-semantics-mysql/' } })
    expect(screen.getByRole('button', { name: `${title} example.com` })).toBeTruthy()
    expect(screen.queryByRole('button', { name: `${title} reference.example.org` })).toBeNull()
    fireEvent.click(site)
    await waitFor(() => expect(show).toHaveBeenCalled())
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
