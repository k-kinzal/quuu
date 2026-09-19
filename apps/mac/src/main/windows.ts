import { app, BrowserWindow, shell } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { attachContextMenu } from './contextMenu.js'
import { WINDOW_BUTTONS } from './windowGeometry.js'
const __dirname = dirname(fileURLToPath(import.meta.url))
export let mainWindow: BrowserWindow | null = null
let isQuitting = false
let keepRunning = () => true
const trustedWindows = new Map<BrowserWindow, string>()
export function configureWindows(keep: () => boolean): void { keepRunning = keep }
export function beginQuit(): void { isQuitting = true }
export function applicationWindows(): BrowserWindow[] { return [...trustedWindows.keys()].filter(w => !w.isDestroyed()) }
export function ownsWindow(win: BrowserWindow): boolean { return trustedWindows.has(win) }
export function windowUrl(win: BrowserWindow): string { return trustedWindows.get(win) ?? '' }
export function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1040,
    minHeight: 620,
    show: false,
    /*
     * No title bar.
     *
     * There is nothing to put in it (macOS shows the name in the menu bar and
     * Dock, and search is handled by the ⌘T palette), so the bar itself goes
     * and the content extends to the top edge. Not `frame: false` — the rounded
     * corners and shadow come from the OS window.
     */
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: WINDOW_BUTTONS.x, y: WINDOW_BUTTONS.y },
    /*
     * No background of our own; let the OS blur show through.
     *
     * Leaving a color in `backgroundColor` puts that color in front and hides
     * the blur. Every surface except the translucent ones (rail, list) paints
     * its own ground in the renderer, so the blur appears only where a veil is laid.
     */
    backgroundColor: '#00000000',
    // The menu material picks up the background color. Keeps the material contrast with the main surface even when inactive.
    vibrancy: 'menu',
    visualEffectState: 'active',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  })

  win.once('ready-to-show', () => win.show())

  // Right-click for inputs, selections, links (a base with no app vocabulary)
  attachContextMenu(win)

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  /*
   * This window is the app itself, not a page being browsed.
   *
   * With nothing in place, **dropping a single file replaces the screen with
   * that file** (the web browser default). There is no way back; you'd have to
   * relaunch the app. External URLs go to the browser; this window stays put.
   */
  win.webContents.on('will-navigate', (event, url) => {
    // A reload (including dev-time HMR) is the same URL, so let it through
    if (url === windowUrl(win)) return
    event.preventDefault()
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  const expectedUrl = !app.isPackaged && devUrl ? new URL(devUrl).href : pathToFileURL(join(__dirname, '../renderer/index.html')).href
  trustedWindows.set(win, expectedUrl)
  if (!app.isPackaged && devUrl) {
    void win.loadURL(devUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  win.on('close', (event) => {
    const keepAlive = keepRunning()
    if (!isQuitting && keepAlive) {
      // The scheduler keeps running with the window closed (unattended operation is the premise)
      event.preventDefault()
      win.hide()
      return
    }
    mainWindow = null
  })

  win.once('closed', () => trustedWindows.delete(win))
  return win
}

export function showWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createWindow()
    return
  }
  if (!mainWindow.isVisible()) mainWindow.show()
  mainWindow.focus()
}
