import { t } from '../i18n/index.js'
import { contentHash } from './hash.js'
import { LAYOUT } from './layout.js'
import { SYNC_VERSION } from './protocol.js'

/**
 * Deliver the UI itself over iCloud. **So it can be fixed without plugging in a cable.**
 *
 * The iPhone app is a Swift shell plus a web UI, and almost everything that gets fixed is on the
 * UI side. **Wiring the device to the Mac for every single character** would mean an annoyance
 * noticed while out stays unfixed until you get home.
 *
 * Plug in only when the shell (Swift) changes. The UI comes through here.
 *
 * ```
 * app/
 *   manifest.json     the current version, plus the file list and fingerprints
 *   <build>/
 *     bundle.bin      the whole UI as one file (concatenated in order, raw deflate)
 * ```
 *
 * **Bundling into one file** is the point. Measured, the UI is 375 files and 13.5MB (syntax
 * highlighting is one file per language), and iCloud carries each of them separately. Left
 * scattered, the device ends up with **a new index.html and old assets**, and nothing can be
 * installed until every last one lands. As one file there is only "there" or "not there".
 * It compresses well, too (13.5MB -> 2.8MB).
 *
 * Splitting the contents back apart is the manifest's job. **Cut by order and `bytes`, verifying
 * each fingerprint one at a time.** The manifest and the contents are written by the same writer
 * at the same time so they cannot disagree, but anything lost in transit fails the check.
 *
 * `manifest.json` is **written last**. Its presence promises the contents are complete, so the
 * iPhone can decide whether to fetch by looking at the manifest alone.
 */

export interface SyncAppFile {
  /** Path relative to `app/<build>/`. `index.html` / `assets/x.js` */
  path: string
  /** SHA-256 (lowercase hex). Both devices check sameness the same way */
  hash: string
  bytes: number
}

export interface SyncAppManifest {
  version: number
  /** This distribution's name. **Derived from the contents**, so the same UI gets the same name */
  build: string
  publishedAt: string
  files: SyncAppFile[]
}

/** The version's name. Decided by the contents alone (a rebuild with the same contents is not redelivered). */
export function buildId(files: SyncAppFile[]): string {
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  return contentHash(sorted.map((f) => `${f.path}:${f.hash}`).join('\n'))
}

/** Where the whole UI in one file lives (relative to the root). */
export function appBundlePath(build: string): string {
  return `${LAYOUT.app}/${build}/bundle.bin`
}

/** The UI's entry point. A distribution without it is not installed. */
export const APP_ENTRY = 'index.html'

export function emptyAppManifest(): SyncAppManifest {
  return { version: SYNC_VERSION, build: '', publishedAt: '', files: [] }
}

export type AppCheck = { ok: true } | { ok: false; reason: string; missing: string[] }

/**
 * May it be installed? **Never install something incomplete.**
 *
 * `present` holds the fingerprints of the files the device could actually read (unreadable ones
 * are not included). If even one is missing or disagrees, it is still in transit, so **do
 * nothing**. A half-installed UI comes up blank the next time it is opened, and there is no way
 * to go fix it from where you are.
 */
export function checkApp(manifest: SyncAppManifest, present: Map<string, string>): AppCheck {
  if (manifest.version !== SYNC_VERSION) {
    return { ok: false, reason: t('mobileSync.unknownDistribution'), missing: [] }
  }
  if (!manifest.build || manifest.files.length === 0) {
    return { ok: false, reason: t('mobileSync.emptyDistribution'), missing: [] }
  }
  if (!manifest.files.some((f) => f.path === APP_ENTRY)) {
    return { ok: false, reason: t('mobileSync.entryMissing', { entry: APP_ENTRY }), missing: [APP_ENTRY] }
  }
  const missing = manifest.files.filter((f) => present.get(f.path) !== f.hash).map((f) => f.path)
  if (missing.length > 0) {
    return { ok: false, reason: t('mobileSync.stillArriving'), missing }
  }
  return { ok: true }
}

/**
 * Should that distribution be installed?
 *
 * **Never go back to one that failed to come up.** Installing a distribution whose UI does not
 * appear means installing it again next time, with no way out short of plugging in a cable.
 * The baked-in UI is always kept, so giving up falls back to it.
 */
export function shouldInstall(
  manifest: SyncAppManifest,
  installed: string | null,
  failed: readonly string[]
): boolean {
  if (!manifest.build) return false
  if (manifest.build === installed) return false
  return !failed.includes(manifest.build)
}
