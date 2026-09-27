import { EventEmitter } from 'node:events'
import type { BrowserWindow } from 'electron'
import { beforeEach, expect, it, vi } from 'vitest'
import { hideDocumentView, navigateDocumentView, showDocumentView } from '../src/main/platform/documentViews.js'

const state = vi.hoisted(() => ({ views: [] as View[], partition: vi.fn(), permissions: vi.fn(), checks: vi.fn(), requests: vi.fn(), sessionOn: vi.fn() }))
class View {
  setBounds = vi.fn()
  webContents = Object.assign(new EventEmitter(), {
    loadURL: vi.fn().mockResolvedValue(undefined), setWindowOpenHandler: vi.fn(),
    close: vi.fn(), isDestroyed: () => false, getURL: () => 'https://example.com/docs/next',
    navigationHistory: { canGoBack: () => true, canGoForward: () => false, goBack: vi.fn(), goForward: vi.fn() }
  })
  constructor(readonly options: unknown) { state.views.push(this) }
}
vi.mock('electron', () => ({
  BrowserWindow: class {},
  WebContentsView: class { constructor(options: unknown) { return new View(options) } },
  session: { fromPartition: (partition: string) => {
    state.partition(partition)
    return { setPermissionRequestHandler: state.permissions, setPermissionCheckHandler: state.checks,
      webRequest: { onBeforeRequest: state.requests }, on: state.sessionOn }
  } }
}))
function owner() {
  return Object.assign(new EventEmitter(), { getContentSize: () => [1000, 700], isDestroyed: () => false,
    contentView: { addChildView: vi.fn(), removeChildView: vi.fn() }, webContents: new EventEmitter() })
}
const bounds = { x: 200, y: 80, width: 2000, height: 2000 }
beforeEach(() => { state.views.length = 0 })

it('isolates remote pages, denies local navigation and keeps the preview inside its owner', async () => {
  const window = owner()
  expect(await showDocumentView(window as unknown as BrowserWindow, { url: 'https://example.com/docs/', bounds })).toEqual({ ok: true })
  const view = state.views[0]
  expect(view.options).toMatchObject({ webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true } })
  expect(state.partition).toHaveBeenCalledWith('quuu-documentation')
  expect(view.setBounds).toHaveBeenCalledWith({ x: 200, y: 80, width: 800, height: 620 })
  const denied = vi.fn()
  view.webContents.emit('will-navigate', { preventDefault: denied }, 'file:///etc/passwd')
  view.webContents.emit('will-redirect', { preventDefault: denied }, 'quuu://tasks/create')
  expect(denied).toHaveBeenCalledTimes(2)
  const allow = vi.fn()
  const handler = state.permissions.mock.calls[0][0] as (_contents: unknown, permission: string, callback: (allowed: boolean) => void) => void
  handler(null, 'media', allow)
  expect(allow).toHaveBeenCalledWith(false)
  window.emit('closed')
  expect(view.webContents.close).toHaveBeenCalledOnce()
})

it('reuses a page on resize, detaches it on leaving, and closes it on window reload', async () => {
  const window = owner()
  const target = window as unknown as BrowserWindow
  await showDocumentView(target, { url: 'https://example.com/docs/', bounds })
  await showDocumentView(target, { url: 'https://example.com/docs/', bounds: { ...bounds, height: 400 } })
  expect(state.views).toHaveLength(1)
  const view = state.views[0]
  expect(view.webContents.loadURL).toHaveBeenCalledOnce()
  hideDocumentView(target)
  expect(window.contentView.removeChildView).toHaveBeenCalledWith(view)
  await showDocumentView(target, { url: 'https://example.com/docs/', bounds })
  navigateDocumentView(target, 'back')
  expect(view.webContents.navigationHistory.goBack).toHaveBeenCalledOnce()
  window.webContents.emit('did-start-navigation', { isMainFrame: true })
  expect(view.webContents.close).toHaveBeenCalledOnce()
})

it('refuses unsafe destinations and reports a failed page load', async () => {
  const window = owner()
  const target = window as unknown as BrowserWindow
  expect((await showDocumentView(target, { url: 'javascript:alert(1)', bounds })).ok).toBe(false)
  expect(state.views).toHaveLength(0)
  await showDocumentView(target, { url: 'https://example.com/docs/', bounds })
  state.views[0].webContents.loadURL.mockRejectedValueOnce(new Error('offline'))
  navigateDocumentView(target, 'reload')
  expect((await showDocumentView(target, { url: 'https://example.com/docs/', bounds })).ok).toBe(false)
  window.emit('closed')
})
