import { spawn } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
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

/** Install folders whose name is not the product's. */
const WINDOWS_FOLDER_NAMES: Record<string, string> = {
  'microsoft vs code': 'Visual Studio Code',
  'microsoft vs code insiders': 'Visual Studio Code Insiders'
}

export function discoverEditors(): EditorApp[] {
  if (process.platform === 'win32') return discoverWindowsEditors()
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

/**
 * Windows has no `.app` to recognise: an editor is an install folder under one of the usual roots,
 * and what gets stored is its executable. JetBrains IDEs and Android Studio keep theirs in `bin`
 * (`idea64.exe`); the rest sit at the top, next to uninstallers and helpers the main program
 * dwarfs, so the largest executable there is the one.
 */
function discoverWindowsEditors(): EditorApp[] {
  const localAppData = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local')
  const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files'
  const roots = [
    join(localAppData, 'Programs'),
    programFiles,
    process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
    join(programFiles, 'JetBrains'),
    join(programFiles, 'Android')
  ]
  const found = new Map<string, EditorApp>()
  for (const root of roots) {
    let entries: string[]
    try {
      entries = readdirSync(root)
    } catch {
      continue
    }
    for (const entry of entries) {
      const folder = WINDOWS_FOLDER_NAMES[entry.toLowerCase()] ?? entry
      if (!isKnownEditor(folder)) continue
      // Installers often lowercase the folder (`cursor`); show the product's own spelling
      const name = KNOWN_EDITORS.find((known) => known.toLowerCase() === folder.toLowerCase()) ?? folder
      const exe = mainExecutable(join(root, entry))
      if (exe && !found.has(exe)) found.set(exe, { path: exe, name })
    }
  }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name))
}

function mainExecutable(dir: string): string | null {
  const executables = (folder: string, pattern: RegExp): string[] => {
    try {
      return readdirSync(folder)
        .filter((file) => pattern.test(file) && !/^(unins|uninstall|update|crash|elevate)/i.test(file))
        .map((file) => join(folder, file))
    } catch {
      return []
    }
  }
  const launcher = executables(join(dir, 'bin'), /64\.exe$/i)[0]
  if (launcher) return launcher
  let best: { path: string; size: number } | null = null
  for (const path of executables(dir, /\.exe$/i)) {
    let size = 0
    try {
      size = statSync(path).size
    } catch {
      continue
    }
    if (!best || size > best.size) best = { path, size }
  }
  return best?.path ?? null
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
  const base = appPath.split(/[\\/]/).filter(Boolean).pop() ?? ''
  return base.toLowerCase().startsWith('xcode')
}

/** Open in the app. If the app has been removed, this is where it shows. */
export function openInApp(appPath: string, target: string): Promise<void> {
  if (!existsSync(appPath)) {
    return Promise.reject(new Error(t('workspace.appMissing', { path: appPath })))
  }
  if (process.platform === 'win32') return startProgram(appPath, target)
  return launch(['-a', appPath, target])
}

/** An editor on Windows is its executable, handed the folder as its one argument. */
function startProgram(executable: string, target: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [target], { detached: true, stdio: 'ignore' })
    child.once('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}
