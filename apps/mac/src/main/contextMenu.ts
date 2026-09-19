import type { BrowserWindow, WebContents } from 'electron'
import { app, clipboard, Menu, shell } from 'electron'
import { contextMenuTemplate, isWebUrl } from './contextMenuTemplate.js'

/**
 * The right-click base.
 *
 * Electron has no context menu by default. With nothing in place, **inputs get
 * no cut / copy / paste on right-click** — unthinkable for a desktop app (the
 * menu bar and ⌘C work, only right-click is missing). This is a base with no
 * app vocabulary, so it lives in one place in main.
 *
 * Where the UI shows its own menu, the renderer calls `preventDefault()` on
 * `contextmenu`. Chromium then doesn't notify here, so "domain menu where one
 * exists, edit menu everywhere else" holds automatically (no double menus, no
 * both-disappear).
 */
export function attachContextMenu(
  win: BrowserWindow,
  contents: WebContents = win.webContents,
  browser = false
): void {
  contents.on('context-menu', (_event, params) => {
    if (win.isDestroyed() || contents.isDestroyed()) return
    const items = contextMenuTemplate(
      params,
      {
        openLink: (url) => {
          if (browser && !isWebUrl(url)) return
          void shell.openExternal(url).catch((error: unknown) => console.error('Could not open browser link', error))
        },
        copyLink: (url) => clipboard.writeText(url),
        copyImage: () => { if (!contents.isDestroyed()) contents.copyImageAt(params.x, params.y) },
        inspect: () => { if (!contents.isDestroyed()) contents.inspectElement(params.x, params.y) }
      },
      !app.isPackaged,
      browser ? {
        url: contents.getURL() || params.pageURL,
        canGoBack: contents.navigationHistory.canGoBack(),
        canGoForward: contents.navigationHistory.canGoForward(),
        goBack: () => {
          if (!contents.isDestroyed() && contents.navigationHistory.canGoBack()) contents.navigationHistory.goBack()
        },
        goForward: () => {
          if (!contents.isDestroyed() && contents.navigationHistory.canGoForward()) contents.navigationHistory.goForward()
        },
        reload: () => { if (!contents.isDestroyed()) contents.reload() }
      } : undefined
    )
    // Nothing to show, nothing to open (no empty black box)
    if (items.length === 0) return
    // Native edit roles must act on the clicked browser, not the surrounding app's input.
    contents.focus()
    Menu.buildFromTemplate(items).popup({ window: win, frame: params.frame ?? undefined })
  })
}
