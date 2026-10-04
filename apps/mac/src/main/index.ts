import { deliverNotification } from './notifications/delivery.js'
import { nativeNotificationLaunch, restoreNativeNotifications, showNativeNotification } from './desktop/notifications.js'
import { app, BrowserWindow, nativeImage, nativeTheme } from 'electron'
import { dirname, join } from 'node:path'
import { unlinkSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { EVENTS } from '../api/channels.js'
import { userDataDir } from './appPaths.js'
import { QuuuApp } from './bootstrap.js'
import type { SchedulerStatus } from './execution/status.js'
import { initMainI18n } from './i18n/index.js'
import { broadcast, followHost, registerIpc, showingHost } from './ipc/index.js'
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
import { onTelemetryChange, startTelemetry, stopTelemetry, telemetryActive, type TelemetryConfig } from './telemetry/index.js'
import { readTelemetryConfig } from './telemetry/config.js'
import { observeApp, reportLaunch } from './telemetry/app.js'
import { observeElectron, reportQuit } from './telemetry/electron.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

let quuu: QuuuApp | null = null
let servers: ServerController | null = null
let updates: AppUpdates | null = null
let quitting = false
let shutdownComplete = false
let broadcastTimer: NodeJS.Timeout | null = null
let started = false
let pendingNotification: { taskId?: string } | null = null

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
  // While the windows show a host, what changes here stays off their screens: they show the host's.
  instance.on('settings', (settings: AppSettings) => {
    applyAppearance(settings.theme)
    if (!showingHost()) broadcast(EVENTS.settings, settings)
  })

  const pushSnapshot = (): void => {
    if (broadcastTimer) return
    // Coalesce bursts of state changes (while running they can fire several times a second)
    broadcastTimer = setTimeout(() => {
      broadcastTimer = null
      const snapshot: AppSnapshot = instance.snapshot()
      if (!showingHost()) broadcast(EVENTS.snapshot, snapshot)
      // Reflect additions/removals in "Go › Projects" (rebuild only when the list changed)
      refreshMenuIfProjectsChanged(quuu?.snapshot().projects ?? [])
    }, 80)
  }

  instance.on('changed', pushSnapshot)

  instance.on('status', (status: SchedulerStatus) => {
    if (!showingHost()) broadcast(EVENTS.schedulerStatus, status)
  })



  instance.on('notify', (toast: ToastPayload) => {
    void notify(instance, toast)
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

function openNotification(taskId?: string): void {
  // History can be clicked while bootstrap is still restoring tasks and wiring IPC.
  if (!started) { pendingNotification = { taskId }; return }
  if (taskId) send('task.open', { taskId }, 'notification')
  else showWindow()
}

function notify(instance: QuuuApp, event: ToastPayload): Promise<void> {
  return deliverNotification(event, instance.settings.getSettings(), {
    toast: payload => { if (!showingHost()) broadcast(EVENTS.toast, payload) },
    native: (payload, title) => showNativeNotification(payload, title, openNotification)
  })
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

// Windows attributes notifications to this ID; it must match the installer's appId (electron-builder.yml)
if (process.platform === 'win32') app.setAppUserModelId('net.kinzal.quuu')

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => { if (started) showWindow() })
  app.on('ready', (_event, launchInfo: unknown) => {
    pendingNotification = nativeNotificationLaunch(launchInfo)
  })

  /*
   * A three-finger page swipe reaches the window as a gesture, never as scrolling the
   * page could read (`swipe.ts`). Registered before any window exists, so the one
   * created at launch and any recreated later all answer it.
   */
  app.on('browser-window-created', (_created, win) => {
    win.on('swipe', (_swipe, direction) => {
      const command = swipeCommand(direction)
      if (command) send(command, undefined, 'gesture')
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
    quuu.settings.load()
    // macOS may wait for the first notification permission response. The window must still open.
    if (quuu.settings.getSettings().nativeNotifications) void restoreNativeNotifications(openNotification)
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
    // Opt-in (telemetry/config.ts), applied before bootstrap so the runs recovery settles are kept,
    // and again whenever `app.setTelemetry` changes it.
    const observed = quuu
    let observing = false
    let launched = false
    const applyTelemetry = async (config: TelemetryConfig): Promise<void> => {
      await stopTelemetry()
      if (!config.enabled) return
      await startTelemetry({ version: app.getVersion(), packaged: app.isPackaged }, config)
      if (!telemetryActive()) return
      // Listeners stay once added; while export is off they return before doing any work.
      if (!observing) { observing = true; observeElectron(app); observeApp(observed) }
      if (launched) reportLaunch(observed)
    }
    onTelemetryChange(applyTelemetry)
    await applyTelemetry(readTelemetryConfig()).catch(error => { console.warn('Cannot start telemetry:', error) })
    await quuu.bootstrap()
    launched = true
    if (telemetryActive()) reportLaunch(quuu)

    // Built after bootstrap so "Go › Projects" can be populated
    refreshMenuIfProjectsChanged(quuu?.snapshot().projects ?? [])
    started = true
    showWindow()
    if (pendingNotification) {
      openNotification(pendingNotification.taskId)
      pendingNotification = null
    }

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
    // Pairing asks another computer's host for a credential; the network client loads only then.
    instance.network.setPairer(async (address, code, name) => (await import('./servers/satellite.js')).pair(address, code, name))
    const networked = (): boolean => instance.network.hosting() !== null || instance.network.status().satellite.enabled
    const startServers = (settings: AppSettings): void => {
      if (servers || startingServers || quitting || (!settings.httpEnabled && !settings.mcpEnabled && !networked())) return
      startingServers = true
      void import('./servers/controller.js').then(async ({ ServerController }) => {
        if (quitting) return
        servers = new ServerController(instance, userDataDir(), () => {
          showWindow()
          if (!mainWindow) throw new Error('Cannot open the desktop window')
          return desktopOperations(mainWindow)
        })
        const controller = servers
        controller.on('satellite', (connected: boolean) => {
          followHost(connected ? controller.satellite : null, payload => { void notify(instance, payload) })
          // Every screen starts over from the side it now shows; nothing of the other side lingers.
          if (!quitting) for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.reload()
        })
        await servers.configure(instance.settings.getSettings())
        await servers.configureNetwork()
      }).catch(error => console.error('Cannot start Quuu servers:', error)).finally(() => { startingServers = false })
    }
    instance.settings.on('changed', startServers)
    instance.network.on('changed', () => startServers(instance.settings.getSettings()))
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
      reportQuit()
      // Stop listeners and caller-owned resources before closing SQLite.
      followHost(null)
      await servers?.stop()
      servers = null
      const instance = quuu
      quuu = null
      instance?.removeAllListeners()
      instance?.shutdown()
      if (broadcastTimer) clearTimeout(broadcastTimer)
      broadcastTimer = null
      instance?.db.close()
      await stopTelemetry()
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
