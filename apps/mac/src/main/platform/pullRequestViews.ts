import { BrowserWindow, WebContentsView } from 'electron'
import { attachContextMenu } from '../contextMenu.js'
import { t } from '../i18n/index.js'
import type { ReviewActionResult } from '../review/types.js'
import type { PullRequestViewBounds, PullRequestViewRequest } from '../terminal/types.js'

interface PullRequestView {
  view: WebContentsView
  url: string
  attached: boolean
}

const viewsByWindow = new Map<BrowserWindow, Map<string, PullRequestView>>()
const observedWindows = new WeakSet<BrowserWindow>()

function pullRequestUrl(value: string): URL | null {
  try {
    const parsed = new URL(value)
    if (
      parsed.protocol === 'https:' &&
      parsed.hostname === 'github.com' &&
      /^\/[^/]+\/[^/]+\/pull\/\d+(?:\/|$)/.test(parsed.pathname)
    ) {
      return parsed
    }
  } catch {
    // Unreadable URLs fold into null below
  }
  return null
}

function githubUrl(value: string): URL | null {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' && parsed.hostname === 'github.com' ? parsed : null
  } catch {
    return null
  }
}

function bounded(owner: BrowserWindow, value: PullRequestViewBounds): PullRequestViewBounds | null {
  if (![value.x, value.y, value.width, value.height].every(Number.isFinite)) return null
  const [ownerWidth, ownerHeight] = owner.getContentSize()
  const x = Math.max(0, Math.min(ownerWidth - 1, Math.round(value.x)))
  const y = Math.max(0, Math.min(ownerHeight - 1, Math.round(value.y)))
  const width = Math.max(0, Math.min(ownerWidth - x, Math.round(value.width)))
  const height = Math.max(0, Math.min(ownerHeight - y, Math.round(value.height)))
  return width > 0 && height > 0 ? { x, y, width, height } : null
}

function entries(owner: BrowserWindow): Map<string, PullRequestView> {
  let values = viewsByWindow.get(owner)
  if (!values) {
    values = new Map()
    viewsByWindow.set(owner, values)
  }
  if (!observedWindows.has(owner)) {
    observedWindows.add(owner)
    owner.once('closed', () => closePullRequestViews(owner))
    owner.webContents.on('did-start-navigation', (details) => {
      // Before a reload wipes the renderer's tab state, fold up the native views stacked on top too.
      if (details.isMainFrame) closePullRequestViews(owner)
    })
  }
  return values
}

function detach(owner: BrowserWindow, entry: PullRequestView): void {
  if (!entry.attached || owner.isDestroyed()) return
  owner.contentView.removeChildView(entry.view)
  entry.attached = false
}

function dispose(owner: BrowserWindow, entry: PullRequestView): void {
  detach(owner, entry)
  if (!entry.view.webContents.isDestroyed()) entry.view.webContents.close()
}

function createView(owner: BrowserWindow, url: URL): PullRequestView {
  const view = new WebContentsView({
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true
    }
  })
  const entry: PullRequestView = { view, url: url.toString(), attached: false }
  attachContextMenu(owner, view.webContents, true)
  view.webContents.setWindowOpenHandler(({ url: next }) => {
    const target = githubUrl(next)
    if (target) void view.webContents.loadURL(target.toString())
    return { action: 'deny' }
  })
  view.webContents.on('will-navigate', (event, next) => {
    if (!githubUrl(next)) event.preventDefault()
  })
  view.webContents.once('destroyed', () => {
    const values = viewsByWindow.get(owner)
    for (const [id, candidate] of values ?? []) {
      if (candidate === entry) values?.delete(id)
    }
  })
  void view.webContents.loadURL(entry.url)
  return entry
}

/** Show only the selected PR, in the code area the renderer indicated. */
export function showPullRequestView(
  owner: BrowserWindow,
  request: PullRequestViewRequest
): ReviewActionResult {
  if (!request.id || request.id.length > 512) {
    return { ok: false, reason: t('review.tabUnidentified') }
  }
  const url = pullRequestUrl(request.url)
  if (!url) return { ok: false, reason: t('review.githubOnly') }
  const bounds = bounded(owner, request.bounds)
  if (!bounds) return { ok: false, reason: t('review.viewAreaUnreadable') }

  const values = entries(owner)
  for (const [id, candidate] of values) {
    if (id !== request.id) detach(owner, candidate)
  }

  let entry = values.get(request.id)
  if (entry && entry.url !== url.toString()) {
    dispose(owner, entry)
    values.delete(request.id)
    entry = undefined
  }
  if (!entry) {
    entry = createView(owner, url)
    values.set(request.id, entry)
  }
  if (!entry.attached) {
    owner.contentView.addChildView(entry.view)
    entry.attached = true
  }
  entry.view.setBounds(bounds)
  return { ok: true }
}

export function hidePullRequestView(owner: BrowserWindow, id: string): ReviewActionResult {
  const entry = viewsByWindow.get(owner)?.get(id)
  if (entry) detach(owner, entry)
  return { ok: true }
}

export function closePullRequestView(owner: BrowserWindow, id: string): ReviewActionResult {
  const values = viewsByWindow.get(owner)
  const entry = values?.get(id)
  if (entry) dispose(owner, entry)
  values?.delete(id)
  if (values?.size === 0) viewsByWindow.delete(owner)
  return { ok: true }
}

export function closePullRequestViews(owner: BrowserWindow): void {
  const values = viewsByWindow.get(owner)
  for (const entry of values?.values() ?? []) dispose(owner, entry)
  viewsByWindow.delete(owner)
}
