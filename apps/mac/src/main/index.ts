import { app, nativeImage, nativeTheme, Notification } from 'electron'
import { dirname, join } from 'node:path'
import { unlinkSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { EVENTS } from '../api/channels.js'
import { userDataDir } from './appPaths.js'
import { QuuuApp } from './bootstrap.js'
import type { SchedulerStatus } from './execution/status.js'
import { initMainI18n, t } from './i18n/index.js'
import { broadcast, registerIpc } from './ipc/index.js'
import { refreshMenuIfProjectsChanged, send, setUpdateMenuItem } from './menus.js'
import { mobileWebRoot } from './mobile-sync/folder.js'
import type { AppSettings } from './settings/types.js'
import type { AppSnapshot, ToastPayload } from './snapshot.js'
import { swipeCommand } from './swipe.js'
import type { ServerController } from './servers/controller.js'
import { appControls, attachAppUpdates, desktopOperations } from './desktop/operations.js'
import { quuuWorkspaceDir } from './projects/builtIn.js'
import { beginQuit, configureWindows, mainWindow, showWindow } from './windows.js'
import { isReleaseBuild } from './updates/distribution.js'
import type { AppUpdates } from './desktop/appUpdates.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

let quuu: QuuuApp | null = null
let servers: ServerController | null = null
let updates: AppUpdates | null = null
let quitting = false
let shutdownComplete = false
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
  instance.on('settings', (settings: AppSettings) => {
    applyAppearance(settings.theme)
    broadcast(EVENTS.settings, settings)
  })

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
    quuu.settings.serverStatus.connectionFile = join(userDataDir(), 'connections.json')
    try { unlinkSync(quuu.settings.serverStatus.connectionFile) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('Cannot remove stale connection information:', error) }
    configureWindows(() => quuu?.settings.getSettings().keepRunningInBackground ?? true)
    // The Mac distributes the iPhone UI via iCloud (so it can be fixed without plugging in a device)
    quuu.setMobileWebRoot(mobileWebRoot(app.isPackaged, process.resourcesPath, __dirname))
    // QuuuAI, the project for operating Quuu itself, runs in the workspace that ships with the app
    quuu.setBuiltInWorkspace(quuuWorkspaceDir(app.isPackaged, process.resourcesPath, __dirname))
    quuu.setAppControls(appControls)
    wire(quuu)
    registerIpc(quuu)
    await quuu.bootstrap()

    // Built after bootstrap so "Go › Projects" can be populated
    refreshMenuIfProjectsChanged(quuu?.snapshot().projects ?? [])
    showWindow()

    if (isReleaseBuild(app.isPackaged, process.platform, app.getAppPath())) {
      void import('./desktop/appUpdates.js').then(({ AppUpdates }) => {
        if (quitting) return
        updates = new AppUpdates(setUpdateMenuItem, () => app.quit())
        attachAppUpdates(updates)
        return updates.start()
      }).catch(error => console.warn('Cannot start Quuu updates:', error))
    }

    // Loading network SDKs follows the first window and is skipped while both listeners are off.
    const instance = quuu
    let startingServers = false
    const startServers = (settings: AppSettings): void => {
      if (servers || startingServers || quitting || (!settings.httpEnabled && !settings.mcpEnabled)) return
      startingServers = true
      void import('./servers/controller.js').then(async ({ ServerController }) => {
        if (quitting) return
        servers = new ServerController(instance, userDataDir(), () => {
          showWindow()
          if (!mainWindow) throw new Error('Cannot open the desktop window')
          return desktopOperations(mainWindow)
        })
        await servers.configure(instance.settings.getSettings())
      }).catch(error => console.error('Cannot start Quuu servers:', error)).finally(() => { startingServers = false })
    }
    instance.settings.on('changed', startServers)
    startServers(instance.settings.getSettings())

    app.on('activate', () => showWindow())
  })

  app.on('window-all-closed', () => {
    const keepAlive = quuu?.settings.getSettings().keepRunningInBackground ?? true
    if (!keepAlive) {
      beginQuit()
      app.quit()
    }
  })

  app.on('before-quit', event => {
    beginQuit()
    if (shutdownComplete) return
    event.preventDefault()
    if (quitting) return
    quitting = true
    updates?.stop()
    void (async () => {
      // Stop listeners and caller-owned resources before closing SQLite.
      await servers?.stop()
      servers = null
      const instance = quuu
      quuu = null
      instance?.removeAllListeners()
      instance?.shutdown()
      if (broadcastTimer) clearTimeout(broadcastTimer)
      broadcastTimer = null
      instance?.db.close()
    })().catch(error => console.error('Quuu shutdown:', error)).finally(() => {
      shutdownComplete = true
      // Finish the canceled native quit event before requesting a fresh quit.
      setImmediate(() => {
        if (!updates?.installAfterShutdown()) app.quit()
      })
    })
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
