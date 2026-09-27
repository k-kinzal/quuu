import { app, autoUpdater, dialog, shell } from 'electron'
import { dirname } from 'node:path'
import { t } from '../i18n/index.js'
import { isSignedForUpdates } from '../updates/signing.js'

export const RELEASES_URL = 'https://github.com/k-kinzal/quuu/releases'
export type UpdateMenuItem = Pick<Electron.MenuItemConstructorOptions, 'label' | 'enabled' | 'click'>
type State = 'starting' | 'unsigned' | 'idle' | 'checking' | 'downloading' | 'ready'

/** One updater for the lifetime of a Release app, independent of its windows. */
export class AppUpdates {
  private state: State = 'starting'
  private stopped = false
  private manual = false
  private installing = false
  private presenting = false
  private startupTimer?: NodeJS.Timeout
  private interval?: NodeJS.Timeout

  constructor(
    private readonly updateMenu: (item: UpdateMenuItem) => void,
    private readonly requestQuit: () => void
  ) {}

  async start(): Promise<void> {
    this.refreshMenu()
    const bundle = dirname(dirname(dirname(app.getPath('exe'))))
    const signed = await isSignedForUpdates(bundle)
    if (this.stopped) return
    if (!signed || !['arm64', 'x64'].includes(process.arch)) {
      this.state = 'unsigned'
      this.refreshMenu()
      return
    }

    // Keep an error listener until process exit, including while a check finishes during shutdown.
    autoUpdater.on('error', this.failed)
    autoUpdater.on('checking-for-update', () => this.changeState('checking'))
    autoUpdater.on('update-available', () => this.changeState('downloading'))
    autoUpdater.on('update-not-available', () => {
      if (this.stopped) return
      this.changeState('idle')
      if (this.manual) void this.message('updates.current')
      this.manual = false
    })
    autoUpdater.on('update-downloaded', () => {
      if (this.stopped) return
      this.manual = false
      this.changeState('ready')
      void this.offerRestart()
    })
    try {
      autoUpdater.setFeedURL({
        url: `${RELEASES_URL}/latest/download/RELEASES-${process.arch}.json`,
        serverType: 'json'
      })
      this.changeState('idle')
      this.startupTimer = setTimeout(() => this.check(), 30_000)
      this.interval = setInterval(() => this.check(), 6 * 60 * 60 * 1000)
      this.startupTimer.unref()
      this.interval.unref()
    } catch (error) {
      this.failed(error instanceof Error ? error : new Error(String(error)))
    }
  }

  check(manual = false): void {
    if (this.stopped || this.presenting) return
    if (this.state === 'unsigned') {
      if (manual) void this.message('updates.unsigned', true)
      return
    }
    if (this.state === 'ready') {
      if (manual) void this.offerRestart()
      return
    }
    if (this.state !== 'idle') return
    this.manual = manual
    this.changeState('checking')
    try { autoUpdater.checkForUpdates() }
    catch (error) { this.failed(error instanceof Error ? error : new Error(String(error))) }
  }

  stop(): void {
    this.stopped = true
    clearTimeout(this.startupTimer)
    clearInterval(this.interval)
  }

  /** Called only after Quuu has stopped its servers and closed SQLite. */
  installAfterShutdown(): boolean {
    if (!this.installing) return false
    try {
      autoUpdater.quitAndInstall()
      return true
    } catch (error) {
      console.error('Cannot restart to install Quuu update:', error)
      return false
    }
  }

  private changeState(state: State): void {
    if (this.stopped) return
    this.state = state
    this.refreshMenu()
  }

  private refreshMenu(): void {
    const key = this.state === 'ready' ? 'updates.restart'
      : this.state === 'checking' || this.state === 'starting' ? 'updates.checking'
      : this.state === 'downloading' ? 'updates.downloading' : 'updates.check'
    this.updateMenu({
      label: t(key),
      enabled: ['idle', 'unsigned', 'ready'].includes(this.state),
      click: () => this.check(true)
    })
  }

  private readonly failed = (error: Error): void => {
    console.warn('Quuu auto update:', error)
    if (this.stopped) return
    this.changeState('idle')
    if (this.manual) void this.message('updates.failed', true)
    this.manual = false
  }

  private async message(key: 'updates.current' | 'updates.unsigned' | 'updates.failed', releases = false): Promise<void> {
    if (this.presenting || this.stopped) return
    this.presenting = true
    try {
      const result = await dialog.showMessageBox({
        type: key === 'updates.failed' ? 'warning' : 'info',
        message: t(key),
        buttons: releases ? [t('updates.releases'), t('updates.close')] : [t('updates.close')],
        defaultId: releases ? 1 : 0,
        cancelId: releases ? 1 : 0,
        noLink: true
      })
      if (!this.stopped && releases && result.response === 0) await shell.openExternal(RELEASES_URL)
    } catch (error) { console.warn('Cannot show update status:', error) }
    finally { this.presenting = false }
  }

  private async offerRestart(): Promise<void> {
    if (this.presenting || this.stopped) return
    this.presenting = true
    try {
      const result = await dialog.showMessageBox({
        type: 'info',
        message: t('updates.ready'),
        detail: t('updates.readyDetail'),
        buttons: [t('updates.restart'), t('updates.later')],
        defaultId: 1,
        cancelId: 1,
        noLink: true
      })
      if (!this.stopped && result.response === 0) {
        this.installing = true
        // app.quit() enters the existing asynchronous shutdown before native installation.
        this.requestQuit()
      }
    } catch (error) { console.warn('Cannot show downloaded update:', error) }
    finally { this.presenting = false }
  }
}
