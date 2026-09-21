import { app, nativeImage, nativeTheme, Notification } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EVENTS } from '../preload/channels.js'
import { userDataDir } from './appPaths.js'
import { QuuuApp } from './bootstrap.js'
import type { SchedulerStatus } from './execution/status.js'
import { initMainI18n, t } from './i18n/index.js'
import { broadcast, registerIpc } from './ipc/index.js'
import { refreshMenuIfProjectsChanged, send } from './menus.js'
import { mobileWebRoot } from './mobile-sync/folder.js'
import type { AppSettings } from './settings/types.js'
import type { AppSnapshot, ToastPayload } from './snapshot.js'
import { swipeCommand } from './swipe.js'
import { TaskApiServer } from './taskApi.js'
import { beginQuit, configureWindows, mainWindow, showWindow } from './windows.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

let quuu: QuuuApp | null = null
let taskApi: TaskApiServer | null = null
let broadcastTimer: NodeJS.Timeout | null = null

const RESOURCES = app.isPackaged
  ? join(process.resourcesPath, 'build')
  : join(__dirname, '../../build')

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Event wiring
// ---------------------------------------------------------------------------

function wire(instance: QuuuApp): void {
  applyAppearance(instance.settings.getSettings().theme)
  instance.on('settings', (settings: AppSettings) => applyAppearance(settings.theme))

  const pushSnapshot = (): void => {
    if (broadcastTimer) return
    // Coalesce bursts of state changes (while running they can fire several times a second)
    broadcastTimer = setTimeout(() => {
      broadcastTimer = null
      const snapshot: AppSnapshot = instance.snapshot()
      broadcast(EVENTS.snapshot, snapshot)
      // Reflect additions/removals in "Go › Projects" (rebuild only when the list changed)
      refreshMenuIfProjectsChanged(quuu?.snapshot().projects ?? [])
    }, 80)
  }

  instance.on('changed', pushSnapshot)

  instance.on('status', (status: SchedulerStatus) => {
    broadcast(EVENTS.schedulerStatus, status)
  })



  instance.on('notify', (toast: ToastPayload) => {
    broadcast(EVENTS.toast, toast)
    notifyNative(instance, toast)
  })
}

/**
 * Tell the OS about the color scheme too.
 *
 * What decides the brightness of the translucent blur (vibrancy) is the **OS
 * appearance**, not the colors the page paints. Darkening only the page leaves
 * the area under the rail bright. The settings vocabulary (`system` / `light` /
 * `dark`) maps to `themeSource` as-is.
 */
function applyAppearance(theme: AppSettings['theme']): void {
  nativeTheme.themeSource = theme
}

function notifyNative(instance: QuuuApp, toast: ToastPayload): void {
  const settings = instance.settings.getSettings()
  if (toast.level === 'success' && !settings.notifyOnReview) return
  if (toast.level === 'error' && !settings.notifyOnFailure) return
  if (toast.level === 'info' || toast.level === 'warn') return
  if (!Notification.isSupported()) return
  // Don't notify while the user is looking at the window (footer and list say enough)
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused()) return

  const notification = new Notification({
    title: toast.level === 'error' ? t('notification.failedTitle') : t('notification.reviewTitle'),
    body: toast.detail ? `${toast.message}\n${toast.detail}` : toast.message,
    silent: false
  })
  notification.on('click', () => {
    showWindow()
    if (toast.taskId) send('task.open', { taskId: toast.taskId })
  })
  notification.show()
}

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

/*
 * Tell Electron where the data lives too. **Unconditionally.**
 *
 * This protects two things at once.
 *
 * 1. A verification instance can run alongside production. The single-instance
 *    lock looks at userData, so if Electron keeps its default even when
 *    `QUUU_USER_DATA` is set, the verification instance silently exits while
 *    production is running (the docs/verification.md procedure did not work as written).
 * 2. Renaming the app doesn't lose UI state. Electron's default userData is
 *    derived from **the app's name**, so the taskd → Quuu rename would move it
 *    wholesale. It holds localStorage (pane widths, ordering, drafts) and
 *    cookies; keeping only the DB and logs under the old name still loses the
 *    UI state. So the location is decided by appPaths, not by the name.
 */
app.setPath('userData', userDataDir())

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showWindow())

  /*
   * A three-finger page swipe reaches the window as a gesture, never as scrolling the
   * page could read (`swipe.ts`). Registered before any window exists, so the one
   * created at launch and any recreated later all answer it.
   */
  app.on('browser-window-created', (_created, win) => {
    win.on('swipe', (_swipe, direction) => {
      const command = swipeCommand(direction)
      if (command) send(command)
    })
  })

  void app.whenReady().then(async () => {
    // Before anything user-visible (menus, notifications, IPC reasons) is built.
    initMainI18n(app.getLocale())
    if (process.platform === 'darwin' && !app.isPackaged) {
      const icon = nativeImage.createFromPath(join(RESOURCES, 'icon.png'))
      if (!icon.isEmpty()) app.dock?.setIcon(icon)
    }

    quuu = new QuuuApp()
    configureWindows(() => quuu?.settings.getSettings().keepRunningInBackground ?? true)
    // The Mac distributes the iPhone UI via iCloud (so it can be fixed without plugging in a device)
    quuu.setMobileWebRoot(mobileWebRoot(app.isPackaged, process.resourcesPath, __dirname))
    wire(quuu)
    registerIpc(quuu)
    await quuu.bootstrap()

    try {
      taskApi = new TaskApiServer(quuu)
      await taskApi.start()
    } catch (error) {
      taskApi = null
      // Even if the API is unavailable, don't take the UI and scheduler down with it.
      console.error('Failed to start the Quuu task API:', error)
    }

    // Built after bootstrap so "Go › Projects" can be populated
    refreshMenuIfProjectsChanged(quuu?.snapshot().projects ?? [])
    showWindow()

    app.on('activate', () => showWindow())
  })

  app.on('window-all-closed', () => {
    const keepAlive = quuu?.settings.getSettings().keepRunningInBackground ?? true
    if (!keepAlive) {
      beginQuit()
      app.quit()
    }
  })

  app.on('before-quit', () => {
    beginQuit()
    void taskApi?.stop()
    taskApi = null
    const instance = quuu
    quuu = null
    // Stop late-arriving updates before closing the DB, so post-quit timers can't touch it.
    instance?.removeAllListeners()
    instance?.shutdown()
    if (broadcastTimer) clearTimeout(broadcastTimer)
    broadcastTimer = null
    instance?.db.close()
  })

  // Killed from outside on every rebuild (`npm run app:restart`). Route signals
  // through the same path as a normal quit so we shut down cleanly and close the DB.
  // Agents are detached, so they are not taken down here.
  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) {
    process.on(signal, () => {
      beginQuit()
      app.quit()
    })
  }
}
