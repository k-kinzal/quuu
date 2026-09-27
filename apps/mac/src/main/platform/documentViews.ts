import { BrowserWindow, WebContentsView, session } from 'electron'
import { documentationUrl } from '../projects/documents.js'
import { t } from '../i18n/index.js'
import type { ReviewActionResult } from '../review/types.js'
import type { PullRequestViewBounds } from '../terminal/types.js'

interface DocumentView {
  view: WebContentsView
  url: string
  attached: boolean
  loaded: Promise<ReviewActionResult>
}
const views = new Map<BrowserWindow, DocumentView>()
const observed = new WeakSet<BrowserWindow>()
let ready = false

function documentSession(): Electron.Session {
  const isolated = session.fromPartition('quuu-documentation')
  if (!ready) {
    ready = true
    isolated.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
    isolated.setPermissionCheckHandler(() => false)
    isolated.on('will-download', event => event.preventDefault())
    isolated.webRequest.onBeforeRequest((details, callback) => {
      const allowed = documentationUrl(details.url) !== null || /^(data:|blob:|devtools:)/.test(details.url)
      callback({ cancel: !allowed })
    })
  }
  return isolated
}

function close(owner: BrowserWindow): void {
  const entry = views.get(owner)
  if (!entry) return
  hideDocumentView(owner)
  if (!entry.view.webContents.isDestroyed()) entry.view.webContents.close()
  views.delete(owner)
}

/** Remote documentation has no preload, app cookies, filesystem, permissions or downloads. */
export async function showDocumentView(owner: BrowserWindow, request: { url: string; bounds: PullRequestViewBounds }): Promise<ReviewActionResult> {
  const url = documentationUrl(request.url)
  if (!url || owner.isDestroyed()) return { ok: false, reason: t('documents.notFound') }
  const bounds = request.bounds
  if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) return { ok: false, reason: t('review.viewAreaUnreadable') }
  const [width, height] = owner.getContentSize()
  const x = Math.max(0, Math.min(width, Math.round(bounds.x)))
  const y = Math.max(0, Math.min(height, Math.round(bounds.y)))
  const rect = { x, y, width: Math.max(0, Math.min(width - x, Math.round(bounds.width))), height: Math.max(0, Math.min(height - y, Math.round(bounds.height))) }
  if (!rect.width || !rect.height) return { ok: false, reason: t('review.viewAreaUnreadable') }
  if (!observed.has(owner)) {
    observed.add(owner)
    owner.once('closed', () => close(owner))
    owner.webContents.on('did-start-navigation', details => { if (details.isMainFrame) close(owner) })
  }
  let entry = views.get(owner)
  if (entry?.url !== url) { close(owner); entry = undefined }
  if (!entry) {
    const view = new WebContentsView({ webPreferences: {
      session: documentSession(), sandbox: true, contextIsolation: true, nodeIntegration: false,
      webSecurity: true, navigateOnDragDrop: false
    } })
    const restrict = (event: Electron.Event, next: string): void => { if (!documentationUrl(next)) event.preventDefault() }
    view.webContents.on('will-navigate', restrict)
    view.webContents.on('will-redirect', restrict)
    view.webContents.on('will-frame-navigate', details => { if (!documentationUrl(details.url)) details.preventDefault() })
    view.webContents.setWindowOpenHandler(({ url: next }) => {
      const target = documentationUrl(next)
      if (target) void view.webContents.loadURL(target).catch(error => console.warn('Documentation navigation failed', error))
      return { action: 'deny' }
    })
    const loaded = view.webContents.loadURL(url).then(() => ({ ok: true }), () => ({ ok: false, reason: t('documents.loadFailed') }))
    entry = { view, url, attached: false, loaded }
    views.set(owner, entry)
  }
  entry.view.setBounds(rect)
  if (!entry.attached) {
    owner.contentView.addChildView(entry.view)
    entry.attached = true
  }
  return entry.loaded
}

export function hideDocumentView(owner: BrowserWindow): ReviewActionResult {
  const entry = views.get(owner)
  if (entry?.attached && !owner.isDestroyed()) owner.contentView.removeChildView(entry.view)
  if (entry) entry.attached = false
  return { ok: true }
}

export function navigateDocumentView(owner: BrowserWindow, direction: 'back' | 'forward' | 'reload'): void {
  const contents = views.get(owner)?.view.webContents
  if (!contents || contents.isDestroyed()) return
  if (direction === 'back' && contents.navigationHistory.canGoBack()) contents.navigationHistory.goBack()
  if (direction === 'forward' && contents.navigationHistory.canGoForward()) contents.navigationHistory.goForward()
  if (direction === 'reload') {
    const entry = views.get(owner)!
    entry.loaded = contents.loadURL(documentationUrl(contents.getURL()) ?? entry.url)
      .then(() => ({ ok: true }), () => ({ ok: false, reason: t('documents.loadFailed') }))
  }
}
