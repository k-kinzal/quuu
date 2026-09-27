import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import { findWindowsCommand } from './windowsLaunch.mjs'

/**
 * A GUI app launched from Finder / Dock gets a minimal PATH, so commands under ~/.local/bin or
 * /opt/homebrew/bin such as `claude` and `codex` are not found.
 * A login shell is started exactly once and its PATH is taken in.
 *
 * Windows hands a GUI app the user's full PATH already, and has no login shell to ask; only the
 * usual per-user install locations are added in case the session predates an install.
 */

let cached: string | null = null

function fallbackDirs(): string[] {
  const home = homedir()
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? join(home, 'AppData', 'Roaming')
    const localAppData = process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local')
    return [
      join(appData, 'npm'),
      join(home, '.local', 'bin'),
      join(home, '.bun', 'bin'),
      join(home, '.deno', 'bin'),
      join(home, '.cargo', 'bin'),
      join(home, 'scoop', 'shims'),
      join(localAppData, 'Volta', 'bin'),
      join(localAppData, 'Microsoft', 'WinGet', 'Links'),
      join(process.env.ProgramFiles ?? 'C:\\Program Files', 'nodejs'),
      join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Git', 'cmd')
    ]
  }
  return [
    join(home, '.local', 'bin'),
    join(home, '.bun', 'bin'),
    join(home, '.deno', 'bin'),
    join(home, '.cargo', 'bin'),
    join(home, '.volta', 'bin'),
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin'
  ]
}

function loginShellPath(): Promise<string> {
  const shell = process.env.SHELL || '/bin/zsh'
  return new Promise<string>((resolve) => {
    const child = execFile(
      shell,
      ['-ilc', 'command printf "%s" "$PATH"'],
      { timeout: 5000, encoding: 'utf8' },
      (err, stdout) => resolve(err ? '' : stdout.trim())
    )
    child.on('error', () => resolve(''))
  })
}

export async function resolveLoginPath(): Promise<string> {
  if (cached) return cached

  const fromShell = process.platform === 'win32' ? '' : await loginShellPath()

  const parts = new Set<string>()
  for (const p of fromShell.split(delimiter)) {
    if (p.length > 0) parts.add(p)
  }
  for (const p of (process.env.PATH ?? '').split(delimiter)) {
    if (p.length > 0) parts.add(p)
  }
  for (const p of fallbackDirs()) {
    if (existsSync(p)) parts.add(p)
  }

  cached = [...parts].join(delimiter)
  return cached
}

/** Called once at startup to reinforce process.env.PATH. */
export async function primeProcessPath(): Promise<void> {
  process.env.PATH = await resolveLoginPath()
}

/**
 * The shell a terminal opens. The login shell on macOS; PowerShell on Windows, the newer `pwsh`
 * when it is installed, since that is what a Windows terminal opens today.
 */
export function interactiveShell(): string {
  if (process.platform !== 'win32') return process.env.SHELL || '/bin/zsh'
  const pwsh = findWindowsCommand('pwsh', process.env)
  if (pwsh) return pwsh
  return join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
}

/** Does the command exist on PATH? Used to validate an agent definition. */
export function commandExists(command: string, path: string): boolean {
  if (process.platform === 'win32') return findWindowsCommand(command, { PATH: path, PATHEXT: process.env.PATHEXT }) !== null
  if (command.includes('/')) return existsSync(command)
  return path.split(delimiter).some((dir) => dir.length > 0 && existsSync(join(dir, command)))
}
