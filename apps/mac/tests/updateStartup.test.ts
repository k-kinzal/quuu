import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const host = vi.hoisted(() => ({
  directory: '', release: true,
  events: new Map<string, (...args: unknown[]) => void>(),
  order: [] as string[],
  quit: vi.fn(), show: vi.fn(), menu: vi.fn(),
  start: vi.fn(), stop: vi.fn(), install: vi.fn(),
  initialized: vi.fn(),
  close: vi.fn(),
  ready: vi.fn<() => Promise<void>>(), command: vi.fn(),
  settings: { serverStatus: {}, on: vi.fn(), load: vi.fn(), getSettings: () => ({ theme: 'system', httpEnabled: false, mcpEnabled: false }) },
  network: { on: vi.fn(), setPairer: vi.fn(), hosting: () => null, status: () => ({ satellite: { enabled: false } }) }
}))
vi.mock('electron', () => ({
  app: {
    isPackaged: true,
    getAppPath: () => '/Applications/Quuu.app/Contents/Resources/app.asar',
    getLocale: () => 'en',
    setPath: vi.fn(), requestSingleInstanceLock: () => true, whenReady: host.ready,
    on: (name: string, callback: (...args: unknown[]) => void) => { host.events.set(name, callback) },
    quit: host.quit
  }, nativeTheme: {}, nativeImage: {}, Notification: { isSupported: () => false }
}))
vi.mock('../src/main/bootstrap.js', () => ({
  QuuuApp: class {
    settings = host.settings
    network = host.network
    db = { close: host.close }
    on = vi.fn()
    removeAllListeners = vi.fn()
    shutdown = vi.fn()
    bootstrap = vi.fn().mockResolvedValue(undefined)
    snapshot = () => ({ projects: [] })
    setMobileWebRoot = vi.fn()
    setBuiltInWorkspace = vi.fn()
    setAppControls = vi.fn()
  }
}))
vi.mock('../src/main/appPaths.js', () => ({ userDataDir: () => host.directory }))
vi.mock('../src/main/ipc/index.js', () => ({ broadcast: vi.fn(), registerIpc: vi.fn(), followHost: vi.fn(), showingHost: () => false }))
vi.mock('../src/main/menus.js', () => ({ refreshMenuIfProjectsChanged: vi.fn(), send: host.command, setUpdateMenuItem: host.menu }))
vi.mock('../src/main/windows.js', () => ({ beginQuit: vi.fn(), configureWindows: vi.fn(), mainWindow: null, showWindow: host.show }))
vi.mock('../src/main/mobile-sync/folder.js', () => ({ mobileWebRoot: () => '' }))
vi.mock('../src/main/desktop/operations.js', () => ({ desktopOperations: vi.fn(), attachAppUpdates: vi.fn(), appControls: {} }))
vi.mock('../src/main/updates/distribution.js', () => ({ isReleaseBuild: () => host.release }))
vi.mock('../src/main/desktop/appUpdates.js', () => ({
  AppUpdates: class {
    constructor(...args: unknown[]) { host.initialized(...args) }
    start = host.start
    stop = host.stop
    installAfterShutdown = host.install
  }
}))

const signals = ['SIGTERM', 'SIGINT', 'SIGHUP'] as const
const originalResources = Object.getOwnPropertyDescriptor(process, 'resourcesPath')
let previousSignals: Map<string, NodeJS.SignalsListener[]>
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  host.directory = mkdtempSync(join(tmpdir(), 'quuu-update-startup-'))
  Object.defineProperty(process, 'resourcesPath', { value: host.directory, configurable: true })
  host.release = true
  host.events.clear()
  host.order.length = 0
  host.start.mockResolvedValue(undefined)
  host.ready.mockResolvedValue(undefined)
  host.close.mockImplementation(() => host.order.push('close database'))
  host.stop.mockImplementation(() => host.order.push('stop updates'))
  host.install.mockImplementation(() => { host.order.push('install update'); return true })
  previousSignals = new Map(signals.map(signal => [signal, process.listeners(signal)]))
})
afterEach(() => {
  if (originalResources) Object.defineProperty(process, 'resourcesPath', originalResources)
  else Reflect.deleteProperty(process, 'resourcesPath')
  for (const signal of signals) {
    for (const listener of process.listeners(signal)) {
      if (!previousSignals.get(signal)?.includes(listener)) process.removeListener(signal, listener)
    }
  }
  rmSync(host.directory, { recursive: true, force: true })
})

it('initializes the Release updater once during startup without needing a notification click', async () => {
  await import('../src/main/index.js')
  await vi.waitFor(() => expect(host.start).toHaveBeenCalledOnce())
  expect(host.initialized).toHaveBeenCalledWith(host.menu, expect.any(Function))
  expect(host.show).toHaveBeenCalledOnce()
  host.events.get('activate')?.()
  expect(host.start).toHaveBeenCalledOnce()
})

it('never constructs an updater for a packaged local build', async () => {
  host.release = false
  await import('../src/main/index.js')
  await vi.waitFor(() => expect(host.show).toHaveBeenCalledOnce())
  expect(host.initialized).not.toHaveBeenCalled()
  expect(host.menu).not.toHaveBeenCalled()
})

it('opens the notification destination after bootstrap when macOS launches the app from a click', async () => {
  let finishReady = (): void => {}
  host.ready.mockReturnValue(new Promise<void>(resolve => { finishReady = resolve }))
  await import('../src/main/index.js')
  const profile = createHash('sha256').update(host.directory).digest('hex')
  host.events.get('ready')?.({}, {
    identifier: `quuu:1:${profile}:notified-task:event`,
    actionIdentifier: 'com.apple.UNNotificationDefaultActionIdentifier'
  })
  // A second launch during bootstrap must not create a window before IPC is wired.
  host.events.get('second-instance')?.()
  expect(host.show).not.toHaveBeenCalled()
  expect(host.command).not.toHaveBeenCalled()
  finishReady()
  await vi.waitFor(() => expect(host.command).toHaveBeenCalledWith('task.open', { taskId: 'notified-task' }, 'notification'))
  expect(host.command).toHaveBeenCalledOnce()
  host.events.get('activate')?.()
  expect(host.command).toHaveBeenCalledOnce()
})

it('stops checks and closes SQLite before handing shutdown to the native installer', async () => {
  await import('../src/main/index.js')
  await vi.waitFor(() => expect(host.start).toHaveBeenCalledOnce())
  const preventDefault = vi.fn()
  host.events.get('before-quit')?.({ preventDefault })
  await vi.waitFor(() => expect(host.install).toHaveBeenCalledOnce())
  expect(preventDefault).toHaveBeenCalledOnce()
  expect(host.order).toEqual(['stop updates', 'close database', 'install update'])
  expect(host.quit).not.toHaveBeenCalled()
})
