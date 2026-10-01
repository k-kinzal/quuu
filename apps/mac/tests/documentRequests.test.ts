import { createRouterClient } from '@orpc/server'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { QuuuApp } from '../src/main/bootstrap.js'
import { createOperationsRouter } from '../src/main/api/router.js'
import type { DesktopOperations, OperationHost } from '../src/main/api/host.js'
import { listProjectDocuments, type ProjectDocuments } from '../src/main/projects/documents.js'

vi.mock('../src/main/projects/documents.js', () => ({ listProjectDocuments: vi.fn(), readProjectDocument: vi.fn() }))
const show = vi.fn(() => Promise.resolve({ ok: true }))
const hide = vi.fn(() => ({ ok: true }))
const unused = (): never => { throw new Error('Unexpected desktop operation') }
const desktop: DesktopOperations = {
  windowLayout: unused, scrollSwipes: unused, pickDirectory: unused, pickApplication: unused,
  confirm: unused, popupMenu: unused, reveal: unused, openExternal: unused, copy: unused,
  lookupBotUser: unused, createGitHubApp: unused, cancelGitHubApp: unused,
  githubWebStatus: unused, githubWebSignIn: unused, githubWebSignOut: unused,
  openPullRequest: unused, hidePullRequest: unused, closePullRequest: unused,
  showReport: unused, hideReport: unused, showDocument: show, hideDocument: hide, navigateDocument: unused
}
const host: OperationHost<string> = {
  authorize: () => undefined, releaseWithOwner: () => () => undefined,
  sendEvent: () => undefined, desktopFor: () => desktop
}
const url = 'https://example.com/docs/'
const documents: ProjectDocuments = { branch: 'main', revision: 'a'.repeat(40), files: [], websites: [{ title: 'Docs', url }] }
const request = { projectId: 'project', url, bounds: { x: 0, y: 0, width: 800, height: 600 } }
let app: QuuuApp
const client = () => createRouterClient(createOperationsRouter(app, host), { context: { owner: 'window' } })
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listProjectDocuments).mockResolvedValue(documents)
  app = new QuuuApp(':memory:')
  app.scheduler.pause()
})
afterEach(() => { app.shutdown(); app.db.close() })

it('shares README discovery across resize requests and opens only the latest bounds', async () => {
  const api = client()
  let resolve!: (value: ProjectDocuments) => void
  vi.mocked(listProjectDocuments).mockReturnValueOnce(new Promise(done => { resolve = done }))
  const first = api.documents.show(request)
  const latest = { ...request, bounds: { ...request.bounds, width: 900 } }
  const second = api.documents.show(latest)
  await vi.waitFor(() => expect(listProjectDocuments).toHaveBeenCalledOnce())
  resolve(documents)
  await Promise.all([first, second])
  expect(show).toHaveBeenCalledOnce()
  expect(show).toHaveBeenCalledWith(latest)
  await api.documents.show(request)
  expect(listProjectDocuments).toHaveBeenCalledOnce()
  await api.documents.hide()
  await api.documents.show(request)
  expect(listProjectDocuments).toHaveBeenCalledTimes(2)
})

it('does not attach a page after the reader leaves while package READMEs are loading', async () => {
  const api = client()
  let resolve!: (value: ProjectDocuments) => void
  vi.mocked(listProjectDocuments).mockReturnValueOnce(new Promise(done => { resolve = done }))
  const pending = api.documents.show(request)
  await vi.waitFor(() => expect(listProjectDocuments).toHaveBeenCalledOnce())
  await api.documents.hide()
  resolve(documents)
  await pending
  expect(show).not.toHaveBeenCalled()
  expect(hide).toHaveBeenCalledOnce()
})

it('validates a different project or URL instead of reusing a previous permission', async () => {
  const api = client()
  await api.documents.show(request)
  await api.documents.show({ ...request, projectId: 'another-project' })
  expect(listProjectDocuments).toHaveBeenCalledTimes(2)
  await expect(api.documents.show({ ...request, url: 'https://unlisted.example/' })).rejects.toMatchObject({ code: 'OPERATION_FAILED' })
  expect(listProjectDocuments).toHaveBeenCalledTimes(3)
  expect(show).toHaveBeenCalledTimes(2)
})
