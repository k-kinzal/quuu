import { existsSync } from 'node:fs'
import type { Db } from '../db/database.js'
import * as repo from '../db/repo.js'
import type { AppSettings } from '../settings/types.js'
import type { MobileSyncStatus } from '../snapshot.js'
import { nowIso } from '../util.js'
import { AppPublisher } from './appPublisher.js'
import { SyncExporter } from './exportSnapshot.js'
import { SyncFolder, syncRoot } from './folder.js'
import type { IntentTarget } from './importIntent.js'
import { SyncImporter } from './importIntent.js'
import type { SyncReceipt } from './protocol.js'

/**
 * How the iPhone sync is driven. **When to write, and when to read.**
 *
 * The judgement belongs to the Mac's task operations, the export to `SyncExporter`, and the
 * import to `SyncImporter`. What is decided here is the cadence, and not stopping the app on failure.
 */

/** The gap between a state change and the export. Folds a burst of changes into one write. */
const EXPORT_DEBOUNCE_MS = 2_000
/**
 * How often to export even when nothing changed.
 *
 * The iPhone reads `generatedAt` to show how current the state is. On a quiet day, a timestamp
 * hours old leaves no way to tell a broken sync from a quiet one.
 */
const EXPORT_HEARTBEAT_MS = 60_000
/**
 * How often to go look for intents.
 *
 * `fs.watch` cannot be trusted on an iCloud folder (no event may fire when the file provider
 * brings something down). It is only a small directory to read, so just go look.
 */
const IMPORT_POLL_MS = 15_000

export class MobileSync {
  private readonly db: Db
  private readonly exporter: SyncExporter
  private readonly publisher = new AppPublisher()
  /** Where the delivered UI lives. Nothing is delivered when it is not given (tests, and dev without a build) */
  private webRoot: string | null = null
  private readonly importer: SyncImporter
  private readonly target: IntentTarget
  private readonly onApplied: (result: { applied: number; conflicts: SyncReceipt[] }) => void

  private folder: SyncFolder | null = null
  private enabled = false
  private debounce: NodeJS.Timeout | null = null
  private heartbeat: NodeJS.Timeout | null = null
  private initialImport: NodeJS.Timeout | null = null
  private poll: NodeJS.Timeout | null = null
  private lastExportAt = ''
  private lastImportAt = ''
  private error = ''
  private importing = false
  private exporting: Promise<void> | null = null
  private publishing: Promise<void> | null = null
  private exportAgain = false
  private schedulerRunning = false

  constructor(
    db: Db,
    target: IntentTarget,
    onApplied: (result: { applied: number; conflicts: SyncReceipt[] }) => void
  ) {
    this.db = db
    this.exporter = new SyncExporter(db)
    this.importer = new SyncImporter(db)
    this.target = target
    this.onApplied = onApplied
  }

  /** Tell it where the delivered UI lives. Once, at startup. */
  setWebRoot(root: string | null): void {
    this.webRoot = root
  }

  /** Re-read the settings. Fold up the timers once disabled (the folder is left alone). */
  configure(settings: AppSettings, schedulerRunning: boolean): void {
    this.schedulerRunning = schedulerRunning
    const next = settings.mobileSyncEnabled
    const root = syncRoot()
    const changed = next !== this.enabled || root !== this.folder?.root

    if (!changed) return
    this.enabled = next
    this.folder = next ? new SyncFolder(root) : null

    this.stopTimers()
    if (!next) return

    this.error = ''
    void this.publishNow()
    void this.exportNow()
    this.heartbeat = setInterval(() => {
      // Check the UI side too. With identical contents it ends after reading one manifest
      void this.publishNow()
      void this.exportNow()
    }, EXPORT_HEARTBEAT_MS)
    this.heartbeat.unref?.()
    this.poll = setInterval(() => { void this.importNow() }, IMPORT_POLL_MS)
    this.poll.unref?.()
    // Right after startup, first clear the intents left while we were away
    this.initialImport = setTimeout(() => { void this.importNow() }, 1_500)
    this.initialImport.unref?.()
  }

  /** Told when the scheduler's state changes (it goes into the snapshot). */
  setSchedulerRunning(running: boolean): void {
    this.schedulerRunning = running
  }

  /**
   * The state changed. **Do not write immediately.**
   * One operation fires `changed` several times, so they are folded into a single write.
   */
  notifyChanged(): void {
    if (!this.enabled) return
    if (this.debounce) clearTimeout(this.debounce)
    this.debounce = setTimeout(() => { void this.exportNow() }, EXPORT_DEBOUNCE_MS)
    this.debounce.unref?.()
  }

  /** Export now (called from "sync now" in settings). */
  exportNow(): Promise<void> {
    if (!this.enabled || !this.folder) return Promise.resolve()
    if (this.debounce) {
      clearTimeout(this.debounce)
      this.debounce = null
    }
    if (this.exporting) { this.exportAgain = true; return this.exporting }
    const folder = this.folder
    const active = (): boolean => this.enabled && this.folder === folder && this.db.isOpen
    this.exportAgain = false
    this.exporting = this.exporter.export(folder, this.schedulerRunning, active).then(result => {
      if (!active()) return
      if (result.wrote) this.lastExportAt = nowIso()
      this.error = ''
    }).catch((error: unknown) => {
      if (active()) this.error = error instanceof Error ? error.message : String(error)
    }).finally(() => {
      this.exporting = null
      // Changes during an iCloud wait must get their own pass; never overlap file writers.
      if (this.exportAgain && this.enabled) void this.exportNow()
    })
    return this.exporting
  }

  /**
   * Deliver the iPhone's UI. **Does nothing when the contents are identical.**
   *
   * Called on every heartbeat, but with no rebuild it ends after reading one manifest
   * (`AppPublisher` checks mtime and size).
   */
  publishNow(): Promise<void> {
    if (!this.enabled || !this.folder || !this.webRoot) return Promise.resolve()
    if (this.publishing) return this.publishing
    const folder = this.folder
    const active = (): boolean => this.enabled && this.folder === folder
    this.publishing = this.publisher.publish(folder, this.webRoot, active).then(() => {}).catch((error: unknown) => {
      if (active()) this.error = error instanceof Error ? error.message : String(error)
    }).finally(() => { this.publishing = null })
    return this.publishing
  }

  /** Import now. */
  async importNow(): Promise<void> {
    if (!this.enabled || !this.folder || this.importing) return
    const folder = this.folder
    const active = (): boolean => this.enabled && this.folder === folder && this.db.isOpen
    this.importing = true
    try {
      const result = await this.importer.sync(folder, this.target, active)
      if (!active()) return
      this.lastImportAt = nowIso()
      this.error = ''
      if (result.applied > 0 || result.deferred > 0 || result.conflicts.length > 0) {
        this.onApplied({ applied: result.applied, conflicts: result.conflicts })
        // Send what was imported straight back to the iPhone (the result of the tap comes back)
        void this.exportNow()
      }
    } catch (e) {
      if (active()) this.error = e instanceof Error ? e.message : String(e)
    } finally { this.importing = false }
  }

  status(): MobileSyncStatus {
    const root = syncRoot()
    return {
      enabled: this.enabled,
      // If the parent (iCloud Drive) is reachable, treat it as simply not created yet
      reachable: existsSync(root) || existsSync(parentOf(root)),
      lastExportAt: this.lastExportAt,
      lastImportAt: this.lastImportAt,
      conflicts: repo.recentConflicts(this.db, 20),
      error: this.error
    }
  }

  shutdown(): void {
    this.enabled = false
    this.stopTimers()
  }

  private stopTimers(): void {
    if (this.initialImport) clearTimeout(this.initialImport)
    this.initialImport = null
    if (this.debounce) clearTimeout(this.debounce)
    if (this.heartbeat) clearInterval(this.heartbeat)
    if (this.poll) clearInterval(this.poll)
    this.debounce = null
    this.heartbeat = null
    this.poll = null
  }
}

function parentOf(path: string): string {
  const i = path.lastIndexOf('/')
  return i <= 0 ? path : path.slice(0, i)
}
