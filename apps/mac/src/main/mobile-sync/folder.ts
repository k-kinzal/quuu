import { execFile } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { LAYOUT, nameFromPlaceholder, placeholderName } from './layout.js'

/**
 * The layer that reads and writes the iCloud Drive folder. **No decisions live here.**
 *
 * To Node, iCloud Drive is just a path, but there are two ways it differs from an ordinary
 * directory.
 *
 *   1. What you write is **read by another process (the file provider)**.
 *      If a half-written file gets hoovered up, the other side reads broken JSON
 *   2. The contents can be thrown away, leaving only a small stand-in named `.<name>.icloud`;
 *      reading it looks like "missing"
 *
 * 1 is handled by writing to a temp file and renaming; 2 by spotting the stand-in and asking `brctl download`.
 */

/**
 * Where it lives. **Not a choice.**
 *
 * Not a dedicated iCloud container (which needs the Developer Program) but a plain folder a human
 * can open in Files, hard-coded. Making it selectable gave nobody a reason to select anything and
 * only added steps for pointing the Mac and the iPhone at the same place.
 *
 * It is overridden by an environment variable (so testing does not touch the real iCloud; the same
 * convention as `QUUU_USER_DATA` and friends).
 */
export function syncRoot(): string {
  const override = process.env.QUUU_MOBILE_SYNC_DIR?.trim()
  if (override) return expandHome(override)
  return join(homedir(), 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'Quuu')
}

function expandHome(path: string): string {
  if (path === '~') return homedir()
  if (path.startsWith('~/')) return join(homedir(), path.slice(2))
  return path
}

export class SyncFolder {
  readonly root: string

  constructor(root: string) {
    this.root = resolve(expandHome(root))
  }

  /** Create the skeleton used for the handover. Safe to call any number of times. */
  ensure(): void {
    mkdirSync(join(this.root, LAYOUT.details), { recursive: true })
    mkdirSync(join(this.root, LAYOUT.intents), { recursive: true })
  }

  path(relative: string): string {
    return join(this.root, relative)
  }

  exists(relative: string): boolean {
    return existsSync(this.path(relative))
  }

  /**
   * Read. When the contents have not come down yet, request them and return null
   * (the next round re-reads). **Missing and not-yet-arrived are told apart.**
   */
  read(relative: string): string | null {
    const full = this.path(relative)
    try {
      return readFileSync(full, 'utf8')
    } catch {
      const slash = relative.lastIndexOf('/')
      const dir = slash < 0 ? this.root : join(this.root, relative.slice(0, slash))
      const name = slash < 0 ? relative : relative.slice(slash + 1)
      if (existsSync(join(dir, placeholderName(name)))) this.download(join(dir, name))
      return null
    }
  }

  /**
   * Write. **Write to a temp file, then rename.**
   *
   * Written directly, iCloud hoovers up the half-finished state and the other side reads half a file.
   * With a rename, the other side only ever sees either "missing" or "complete".
   */
  write(relative: string, text: string): void {
    const full = this.path(relative)
    const slash = full.lastIndexOf('/')
    mkdirSync(full.slice(0, slash), { recursive: true })
    // A leading dot also marks a file as not-uploaded to iCloud, so none is left lying around
    const tmp = `${full}.tmp`
    writeFileSync(tmp, text, 'utf8')
    renameSync(tmp, full)
  }

  /** Place the bytes as-is (delivering the UI: images and fonts are mixed in, so not as text). */
  writeBytes(relative: string, body: Buffer): void {
    const full = this.path(relative)
    mkdirSync(dirname(full), { recursive: true })
    const tmp = `${full}.tmp`
    writeFileSync(tmp, body)
    renameSync(tmp, full)
  }

  remove(relative: string): void {
    rmSync(this.path(relative), { force: true })
  }

  /** Delete a whole directory (so an old delivered version is not left behind). */
  removeDir(relative: string): void {
    rmSync(this.path(relative), { recursive: true, force: true })
  }

  /**
   * List. A file that has not come down yet **is still visible by name**, so the stand-in is
   * mapped back to the real name and its download is requested at the same time.
   */
  list(relativeDir: string): string[] {
    const dir = this.path(relativeDir)
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return []
    }
    const names = new Set<string>()
    for (const entry of entries) {
      if (entry.endsWith('.tmp')) continue
      const real = nameFromPlaceholder(entry)
      if (real) {
        this.download(join(dir, real))
        names.add(real)
        continue
      }
      if (entry.startsWith('.')) continue
      names.add(entry)
    }
    return [...names].sort()
  }

  /** Modification time. 0 when it cannot be read (treated as old). */
  mtime(relative: string): number {
    try {
      return statSync(this.path(relative)).mtimeMs
    } catch {
      return 0
    }
  }

  /**
   * Fetch the contents. **Do not wait for an answer.**
   *
   * `brctl download` works asynchronously, so waiting buys nothing. Ask for it, and it is enough
   * if the next round can read it. Failures are silent (an environment with iCloud disabled must
   * not stop the app; there it simply behaves as an ordinary directory).
   */
  private download(full: string): void {
    execFile('brctl', ['download', full], () => { })
  }
}


/**
 * Where the UI that gets delivered (the iPhone's web build) lives.
 *
 * It is baked into the Mac app (`Resources/mobile-web`). **Never picked up from anywhere else** -
 * what is delivered would stop corresponding one-to-one with "the version of Quuu running right
 * now". Only a dev launch looks at `apps/mobile/dist`.
 */
export function mobileWebRoot(packaged: boolean, resourcesPath: string, dirname: string): string {
  return packaged
    ? join(resourcesPath, 'mobile-web')
    : resolve(dirname, '../../../mobile/dist')
}
