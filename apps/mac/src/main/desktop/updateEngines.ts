import { app, autoUpdater, net } from 'electron'
import { execFile, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { EventEmitter, once } from 'node:events'
import { createWriteStream, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { isSignedForUpdates } from '../updates/signing.js'
import { pendingUpdate, windowsFeedName } from '../updates/windowsFeed.js'

/** The part of Electron's `autoUpdater` that AppUpdates drives: events, a JSON feed, check, install. */
export interface Updater {
  on(event: 'error', listener: (error: Error) => void): unknown
  on(event: 'checking-for-update', listener: () => void): unknown
  on(event: 'update-available', listener: () => void): unknown
  on(event: 'update-not-available', listener: () => void): unknown
  on(event: 'update-downloaded', listener: () => void): unknown
  setFeedURL(options: Electron.FeedURLOptions): void
  checkForUpdates(): void
  quitAndInstall(): void
}

/**
 * How one platform updates itself. AppUpdates keeps the schedule, the states and the dialogs;
 * the engine says which feed to read, whether this copy can be replaced, and does the replacing.
 */
export interface UpdateEngine {
  /** The file in the latest GitHub Release this installation reads. */
  feed: string
  updater: Updater
  canReplaceItself(): Promise<boolean>
  /** What to tell someone who asks for an update this copy cannot apply. */
  manualReason: 'updates.unsigned' | 'updates.portable'
  /** What to tell someone whose manual check failed. */
  failureReason: 'updates.failed' | 'updates.downloadFailed'
}

export function platformUpdateEngine(): UpdateEngine {
  return process.platform === 'win32' ? windowsEngine() : macEngine()
}

/** Squirrel.Mac, which replaces a bundle only with one signed by the same certificate. */
function macEngine(): UpdateEngine {
  return {
    feed: `RELEASES-${process.arch}.json`,
    updater: autoUpdater,
    canReplaceItself: () => isSignedForUpdates(dirname(dirname(dirname(app.getPath('exe'))))),
    manualReason: 'updates.unsigned',
    // Squirrel.Mac cannot replace a copy running outside Applications, the usual reason it fails
    failureReason: 'updates.failed'
  }
}

/**
 * The NSIS installer the Release carries, run silently over the installed copy.
 *
 * Only an installed copy can be replaced: one unzipped anywhere has no install to update, and
 * the installer would put a second Quuu somewhere else. The uninstaller NSIS leaves beside the
 * executable is what marks an installation.
 */
function windowsEngine(): UpdateEngine {
  return {
    feed: windowsFeedName(process.arch),
    updater: new WindowsInstallerUpdater(),
    canReplaceItself: () => Promise.resolve(existsSync(join(dirname(app.getPath('exe')), `Uninstall ${app.getName()}.exe`))),
    manualReason: 'updates.portable',
    failureReason: 'updates.downloadFailed'
  }
}

/**
 * Electron's autoUpdater on Windows is Squirrel.Windows, which only updates Squirrel installs.
 * This speaks the same events over the same JSON feed for the NSIS installer instead.
 *
 * The installer is trusted the way a manual download is: fetched from the Release over HTTPS and
 * checked against the digest and size the feed names. A signed installation also refuses an
 * installer not signed by its own publisher, the Windows half of "an unsigned build never replaces
 * a signed one".
 */
export class WindowsInstallerUpdater extends EventEmitter implements Updater {
  private feedUrl = ''
  private installer: string | null = null
  private launched = false

  constructor() {
    super()
    // Like Squirrel.Mac, a downloaded update applies on quit even without "Restart to Update"
    app.on('will-quit', () => this.install(false))
  }

  setFeedURL(options: Electron.FeedURLOptions): void {
    this.feedUrl = options.url
  }

  checkForUpdates(): void {
    void this.check()
  }

  quitAndInstall(): void {
    if (!this.installer) throw new Error('No update has been downloaded')
    this.install(true)
    app.quit()
  }

  /** --updated keeps the install's place and settings; --force-run starts Quuu again afterwards. */
  private install(restart: boolean): void {
    if (!this.installer || this.launched) return
    this.launched = true
    const args = ['--updated', '/S', ...(restart ? ['--force-run'] : [])]
    spawn(this.installer, args, { detached: true, stdio: 'ignore' }).unref()
  }

  private async check(): Promise<void> {
    this.emit('checking-for-update')
    try {
      const response = await net.fetch(this.feedUrl)
      if (!response.ok) throw new Error(`The update feed returned ${String(response.status)}`)
      const update = pendingUpdate(await response.json(), app.getVersion())
      if (!update) {
        this.emit('update-not-available')
        return
      }
      this.emit('update-available')
      const installer = await download(update.url, update.sha256, update.size)
      const publisher = await authenticodeSigner(app.getPath('exe'))
      if (publisher !== null && (await authenticodeSigner(installer)) !== publisher) {
        rmSync(installer, { force: true })
        throw new Error('The update is not signed by the publisher of this installation')
      }
      this.installer = installer
      this.emit('update-downloaded')
    } catch (error) {
      this.emit('error', error instanceof Error ? error : new Error(String(error)))
    }
  }
}

async function download(url: string, sha256: string, size: number): Promise<string> {
  const dir = join(app.getPath('temp'), 'quuu-update')
  mkdirSync(dir, { recursive: true })
  const path = join(dir, url.split('/').at(-1) ?? 'Quuu-setup.exe')
  const response = await net.fetch(url)
  if (!response.ok || !response.body) throw new Error(`The installer download returned ${String(response.status)}`)
  const digest = createHash('sha256')
  const file = createWriteStream(path)
  let received = 0
  try {
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      digest.update(chunk)
      received += chunk.length
      if (!file.write(chunk)) await once(file, 'drain')
    }
  } finally {
    file.end()
    await once(file, 'close')
  }
  if (received !== size || digest.digest('hex') !== sha256) {
    rmSync(path, { force: true })
    throw new Error('The downloaded installer does not match the update feed')
  }
  return path
}

/** The subject of a valid Authenticode signature, or null when the file carries none. */
function authenticodeSigner(path: string): Promise<string | null> {
  const powershell = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  const script = "$s = Get-AuthenticodeSignature -LiteralPath $env:QUUU_SIGNED_FILE; if ($s.Status -eq 'Valid') { $s.SignerCertificate.Subject }"
  return new Promise((resolve, reject) => {
    execFile(powershell, ['-NoProfile', '-NonInteractive', '-Command', script], {
      env: { ...process.env, QUUU_SIGNED_FILE: path },
      encoding: 'utf8',
      timeout: 30_000,
      windowsHide: true
    }, (error, stdout) => {
      if (error) reject(new Error('Could not read the installer signature'))
      else resolve(stdout.trim() || null)
    })
  })
}
