import { BrowserWindow, WebContentsView, session, shell } from 'electron'
import { pathToFileURL } from 'node:url'
import { reportRoot } from '../appPaths.js'
import { attachContextMenu } from '../contextMenu.js'
import { t } from '../i18n/index.js'
import type { ReviewActionResult } from '../review/types.js'
import type { PullRequestViewBounds } from '../terminal/types.js'

/**
 * Showing a generated report page.
 *
 * The page is written by an agent, so it is displayed the way anything unreviewed is: in its own
 * sandboxed view, never inside the app's document.
 *
 * **A static document, not an app.** Script ran here for a while, for a drawing library beside
 * the reports; the library is gone and with it the only reason. The session also drops every
 * request that is not a file under the report root, so nothing a page was told about this
 * machine can leave it, and a report opens the same years from now.
 *
 * A link a person clicks still works: navigation is refused inside the view and handed to the
 * real browser, which is where evidence links (a commit, a pull request) belong anyway.
 */
interface ReportView {
  view: WebContentsView
  file: string
  attached: boolean
}

const viewsByWindow = new Map<BrowserWindow, ReportView>()
const observedWindows = new WeakSet<BrowserWindow>()
const PARTITION = 'quuu-report'
let sessionReady = false

/**
 * Only the report's own files load. Everything else, the network included, is refused.
 *
 * It was open for a while, to see what a writer reached for when it could reach anywhere: a
 * font, a chart library, an icon set, a diagram engine. That question is answered, and what it
 * wanted now ships beside the reports instead. A report is written by an agent out of a
 * repository's contents, and an open door lets one carry what it read there to a server.
 */
function allowed(url: string): boolean {
  if (url.startsWith('devtools:')) return true
  if (!url.startsWith('file://')) return false
  try {
    return decodeURIComponent(new URL(url).pathname).startsWith(`${reportRoot()}/`)
  } catch {
    return false
  }
}

function reportSession(): Electron.Session {
  const partition = session.fromPartition(PARTITION)
  if (!sessionReady) {
    sessionReady = true
    partition.webRequest.onBeforeRequest((details, callback) => {
      callback({ cancel: !allowed(details.url) })
    })
  }
  return partition
}

function externalUrl(value: string): string | null {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null
  } catch {
    return null
  }
}

function detach(owner: BrowserWindow, entry: ReportView): void {
  if (!entry.attached || owner.isDestroyed()) return
  owner.contentView.removeChildView(entry.view)
  entry.attached = false
}

function dispose(owner: BrowserWindow, entry: ReportView): void {
  detach(owner, entry)
  if (!entry.view.webContents.isDestroyed()) entry.view.webContents.close()
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

function observe(owner: BrowserWindow): void {
  if (observedWindows.has(owner)) return
  observedWindows.add(owner)
  owner.once('closed', () => closeReportView(owner))
  owner.webContents.on('did-start-navigation', (details) => {
    // Before a reload wipes the renderer's state, fold up the native view stacked on top too
    if (details.isMainFrame) closeReportView(owner)
  })
}

function createView(owner: BrowserWindow, file: string): ReportView {
  const view = new WebContentsView({
    webPreferences: {
      session: reportSession(),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      // A report is read, not run
      javascript: false
    }
  })
  const entry: ReportView = { view, file, attached: false }
  attachContextMenu(owner, view.webContents, true)
  view.webContents.setWindowOpenHandler(({ url }) => {
    const target = externalUrl(url)
    if (target) void shell.openExternal(target)
    return { action: 'deny' }
  })
  view.webContents.on('will-navigate', (event, url) => {
    if (url === pathToFileURL(entry.file).toString()) return
    event.preventDefault()
    const target = externalUrl(url)
    if (target) void shell.openExternal(target)
  })
  void view.webContents.loadURL(pathToFileURL(file).toString())
  return entry
}

/** Show the report page in the area the renderer indicated. */
export function showReportView(
  owner: BrowserWindow,
  request: { file: string; bounds: PullRequestViewBounds }
): ReviewActionResult {
  if (!allowed(pathToFileURL(request.file).toString())) {
    return { ok: false, reason: t('report.outsideReports') }
  }
  const bounds = bounded(owner, request.bounds)
  if (!bounds) return { ok: false, reason: t('review.viewAreaUnreadable') }
  observe(owner)

  let entry = viewsByWindow.get(owner)
  if (entry && entry.file !== request.file) {
    dispose(owner, entry)
    viewsByWindow.delete(owner)
    entry = undefined
  }
  if (!entry) {
    entry = createView(owner, request.file)
    viewsByWindow.set(owner, entry)
  }
  if (!entry.attached) {
    owner.contentView.addChildView(entry.view)
    entry.attached = true
  }
  entry.view.setBounds(bounds)
  return { ok: true }
}

/** Take the view off screen but keep it, so returning to the surface does not reload. */
export function hideReportView(owner: BrowserWindow): ReviewActionResult {
  const entry = viewsByWindow.get(owner)
  if (entry) detach(owner, entry)
  return { ok: true }
}

export function closeReportView(owner: BrowserWindow): void {
  const entry = viewsByWindow.get(owner)
  if (!entry) return
  dispose(owner, entry)
  viewsByWindow.delete(owner)
}
