import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative as relativePath } from 'node:path'
import { deflateRawSync } from 'node:zlib'
import { t } from '../i18n/index.js'
import { nowIso } from '../util.js'
import type { SyncAppFile, SyncAppManifest } from './appDistribution.js'
import { APP_ENTRY, appBundlePath, buildId, emptyAppManifest } from './appDistribution.js'
import type { SyncFolder } from './folder.js'
import { LAYOUT } from './layout.js'
import { parseAppManifest } from './readAppManifest.js'

/**
 * Put the iPhone's UI onto iCloud. **So it can be fixed without plugging in a cable.**
 *
 * The iPhone app is a Swift shell plus a web UI, and almost everything that gets fixed is on the
 * UI side. Wiring the device to the Mac for every single character would mean
 * **an annoyance noticed while out stays unfixed until you get home**.
 *
 * Plug in only when the shell changes. The UI is delivered through here.
 *
 * What is delivered is **the UI baked into the Mac app** (`resources/mobile-web`).
 * Never picked up from somewhere else - what is delivered would stop corresponding one-to-one
 * with "the version of Quuu running right now".
 */

/** Not included in a distribution. Source maps mean nothing to anyone without the sources */
const SKIP = new Set(['.DS_Store'])
const SKIP_EXT = ['.map']

export interface PublishResult {
  /** Whether anything was placed (identical contents are not placed) */
  published: boolean
  build: string
  files: number
  reason: string
}

export class AppPublisher {
  /** The manifest built last time. Not re-read unless something was rebuilt */
  private cached: { key: string; manifest: SyncAppManifest } | null = null

  /**
   * One delivery pass.
   *
   * **The manifest is written last.** Making its presence a promise that the contents are complete
   * lets the iPhone decide from the manifest alone (arrival order is still not guaranteed, so it
   * verifies on its side too).
   */
  publish(folder: SyncFolder, source: string | null): PublishResult {
    const none = { published: false, build: '', files: 0 }
    if (!source || !existsSync(join(source, APP_ENTRY))) {
      return { ...none, reason: t('mobileSync.screensNotFound') }
    }

    const manifest = this.read(source)
    if (manifest.files.length === 0) return { ...none, reason: t('mobileSync.screensEmpty') }

    /*
     * Is it already delivered? **Do not decide from the manifest alone.**
     *
     * The version comes from the contents, so changing how it is carried (file-by-file -> one
     * bundle) does not change the version. Looking only at the manifest calls the **old shape
     * "already delivered" and it is never replaced** (that actually happened).
     */
    const current = folder.read(LAYOUT.appManifest)
    const parsed = current ? parseAppManifest(current) : null
    const done = parsed?.ok && parsed.value.build === manifest.build
    if (done && folder.exists(appBundlePath(manifest.build))) {
      return { published: false, build: manifest.build, files: 0, reason: '' }
    }

    // The same version is sometimes redelivered (the shape changed). Leave none of the old contents
    folder.removeDir(`${LAYOUT.app}/${manifest.build}`)

    /*
     * Concatenate in manifest order into one file. **Do not make iCloud carry 375 files.**
     * It compresses well too (measured 13.5MB -> 2.8MB). The manifest's `bytes` cuts it apart
     */
    const blob = Buffer.concat(manifest.files.map((f) => readFileSync(join(source, f.path))))
    folder.writeBytes(appBundlePath(manifest.build), deflateRawSync(blob, { level: 9 }))
    // The manifest last. Its presence promises the contents are complete
    folder.write(LAYOUT.appManifest, JSON.stringify(manifest))

    // Keep no old versions. They eat iCloud storage once per version
    for (const name of folder.list(LAYOUT.app)) {
      if (name === 'manifest.json' || name === manifest.build) continue
      folder.removeDir(`${LAYOUT.app}/${name}`)
    }

    return { published: true, build: manifest.build, files: manifest.files.length, reason: '' }
  }

  /**
   * Build the manifest from the baked-in UI.
   *
   * The contents are read **only when something was rebuilt**. The export runs every 60 seconds,
   * and reading every file to SHA-256 it each time stalls the main process while it does
   * (which actually happened with the detail export).
   */
  private read(source: string): SyncAppManifest {
    const found = walk(source, source).sort()
    const key = JSON.stringify(
      found.map((path) => {
        const info = statSync(join(source, path))
        return [path, info.mtimeMs, info.size]
      })
    )
    if (this.cached?.key === key) return this.cached.manifest

    const files: SyncAppFile[] = found.map((path) => {
      const body = readFileSync(join(source, path))
      return {
        path,
        hash: createHash('sha256').update(body).digest('hex'),
        bytes: body.byteLength
      }
    })
    const manifest: SyncAppManifest = {
      ...emptyAppManifest(),
      build: buildId(files),
      publishedAt: nowIso(),
      files
    }
    this.cached = { key, manifest }
    return manifest
  }
}

function walk(root: string, dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIP.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...walk(root, full))
      continue
    }
    if (SKIP_EXT.some((ext) => entry.name.endsWith(ext))) continue
    out.push(relativePath(root, full))
  }
  return out
}
