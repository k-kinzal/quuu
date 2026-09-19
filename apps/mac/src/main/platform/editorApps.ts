import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { applicationDirs } from '../appPaths.js'
import { t } from '../i18n/index.js'
import type { EditorApp } from './editorChoice.js'
import { launch } from './launch.js'

/**
 * Discover installed IDEs / editors.
 *
 * Do not list all of `/Applications`. That would mean choosing among hundreds,
 * most of which can do nothing useful when handed a directory.
 * Pick by name **only the ones that can be an open target**.
 *
 * Names are matched by prefix. The same IDE grows a suffix per edition
 * (`PyCharm Community Edition` / `Android Studio Preview` /
 * `IntelliJ IDEA Ultimate` / Toolbox-installed `GoLand 2024.3`).
 * Exact matching here always leaves some installed apps undiscovered.
 */
const KNOWN_EDITORS = [
  // JetBrains (a separate app per language — the original motivation for all this)
  'IntelliJ IDEA',
  'PyCharm',
  'WebStorm',
  'GoLand',
  'CLion',
  'RubyMine',
  'PhpStorm',
  'Rider',
  'RustRover',
  'DataGrip',
  'DataSpell',
  'Aqua',
  'AppCode',
  'Writerside',
  'Fleet',
  'Android Studio',
  // Apple
  'Xcode',
  // Others that can open a directory
  'Visual Studio Code',
  'VSCodium',
  'Cursor',
  'Windsurf',
  'Zed',
  'Sublime Text',
  'Nova',
  'BBEdit',
  'CotEditor',
  'Antigravity'
] as const

/** What Xcode accepts. Searched left to right; falls back to the directory itself. */
const XCODE_TARGETS = ['.xcworkspace', '.xcodeproj']

export function discoverEditors(): EditorApp[] {
  const found = new Map<string, EditorApp>()

  for (const dir of applicationDirs()) {
    let names: string[]
    try {
      names = readdirSync(dir)
    } catch {
      // Silently skip directories that don't exist (Toolbox not in use)
      continue
    }
    for (const entry of names) {
      if (!entry.endsWith('.app')) continue
      const name = entry.slice(0, -'.app'.length)
      if (!isKnownEditor(name)) continue
      const path = join(dir, entry)
      if (!found.has(path)) found.set(path, { path, name })
    }
  }

  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name))
}

function isKnownEditor(name: string): boolean {
  const lower = name.toLowerCase()
  return KNOWN_EDITORS.some((known) => lower.startsWith(known.toLowerCase()))
}

/**
 * What actually gets handed to the app.
 *
 * Only Xcode is special-cased. Handed a directory it does open, but as a
 * "just peeking at a folder" state where neither build nor test works.
 * If a `.xcworkspace` / `.xcodeproj` exists, pass that instead, so that
 * **what the click lands on is a usable project**.
 */
export function openTargetFor(appPath: string, dir: string): string {
  if (!isXcode(appPath)) return dir

  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return dir
  }
  for (const suffix of XCODE_TARGETS) {
    // When both exist at the same level, prefer the workspace (Xcode's own convention)
    const hit = entries.find((e) => e.endsWith(suffix))
    if (hit) return join(dir, hit)
  }
  return dir
}

function isXcode(appPath: string): boolean {
  const base = appPath.split('/').filter(Boolean).pop() ?? ''
  return base.toLowerCase().startsWith('xcode')
}

/** Open in the app. If the app has been removed, this is where it shows. */
export function openInApp(appPath: string, target: string): Promise<void> {
  if (!existsSync(appPath)) {
    return Promise.reject(new Error(t('workspace.appMissing', { path: appPath })))
  }
  return launch(['-a', appPath, target])
}
