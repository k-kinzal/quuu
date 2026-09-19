import { contentHash } from './hash.js'
import { LAYOUT } from './layout.js'
import { SYNC_VERSION } from './protocol.js'

/**
 * Distribute the UI itself over iCloud. **So it can be fixed without a cable.**
 *
 * The iPhone app is a Swift shell plus a Web UI, and what needs fixing is
 * almost always the UI. Yet **plugging the device into the Mac for every
 * one-character fix** means an annoyance noticed on the go stays broken
 * until you get home.
 *
 * Plug in only when the shell (Swift) changes. The UI travels through here.
 *
 * ```
 * app/
 *   manifest.json     Current build, plus the list of files and their fingerprints
 *   <build>/
 *     bundle.bin      The whole UI in one piece (concatenated in order, raw deflate)
 * ```
 *
 * **One piece** is the point. Measured, the UI is 375 files / 13.5MB
 * (syntax highlighting ships one file per language), and iCloud transfers
 * each file separately. Scattered, a device can end up with **a new
 * index.html and old assets**, and nothing can be installed until every
 * last file arrives. One piece is either there or not. It also compresses
 * (13.5MB → 2.8MB).
 *
 * The manifest owns the slicing: **cut by order and `bytes`, then verify
 * each fingerprint**. Manifest and content are written together by the same
 * writer so they cannot drift, but anything damaged in transit fails the
 * fingerprint check.
 *
 * `manifest.json` is written **last of all**. With the promise "it exists =
 * the content is complete", the iPhone can decide whether to fetch by
 * looking at the manifest alone.
 */

export interface SyncAppFile {
  /** Path relative to `app/<build>/`. `index.html` / `assets/x.js` */
  path: string
  /** SHA-256 (lowercase hex). Both devices check content equality the same way */
  hash: string
  bytes: number
}

export interface SyncAppManifest {
  version: number
  /** Name of this distribution. **Derived from the content**, so the same UI gets the same name */
  build: string
  publishedAt: string
  files: SyncAppFile[]
}

/** Build name. Determined by content alone (a rebuild with identical content is not redistributed). */
export function buildId(files: SyncAppFile[]): string {
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  return contentHash(sorted.map((f) => `${f.path}:${f.hash}`).join('\n'))
}

/** Where the single-piece UI lives (relative to the root). */
export function appBundlePath(build: string): string {
  return `${LAYOUT.app}/${build}/bundle.bin`
}

/** Entry point of the UI. A distribution without it is not installed. */
export const APP_ENTRY = 'index.html'

export function emptyAppManifest(): SyncAppManifest {
  return { version: SYNC_VERSION, build: '', publishedAt: '', files: [] }
}

export type AppCheck = { ok: true } | { ok: false; reason: string; missing: string[] }

/**
 * May it be installed? **Never install an incomplete set.**
 *
 * `present` holds the fingerprints of files the device could actually read
 * (unreadable ones are absent). If even one is missing or mismatched, treat
 * it as still in transit and **do nothing**. A half-installed UI means a
 * blank screen on next open — with no way at hand to go fix it.
 */
export function checkApp(manifest: SyncAppManifest, present: Map<string, string>): AppCheck {
  if (manifest.version !== SYNC_VERSION) {
    return { ok: false, reason: 'Unknown distribution version', missing: [] }
  }
  if (!manifest.build || manifest.files.length === 0) {
    return { ok: false, reason: 'It has no content', missing: [] }
  }
  if (!manifest.files.some((f) => f.path === APP_ENTRY)) {
    return { ok: false, reason: `${APP_ENTRY} is missing`, missing: [APP_ENTRY] }
  }
  const missing = manifest.files.filter((f) => present.get(f.path) !== f.hash).map((f) => f.path)
  if (missing.length > 0) {
    return { ok: false, reason: 'Not everything has arrived yet', missing }
  }
  return { ok: true }
}

/**
 * Whether to go install that distribution.
 *
 * **Never return to one that failed to boot.** Install a distribution whose
 * UI does not come up and you will reinstall the same one next time too,
 * with no way out until a cable is plugged in. The baked-in UI is always
 * kept, so giving up falls back to it.
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
