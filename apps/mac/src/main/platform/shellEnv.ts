import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'

/**
 * A GUI app launched from Finder / Dock gets a minimal PATH, so commands under ~/.local/bin or
 * /opt/homebrew/bin such as `claude` and `codex` are not found.
 * A login shell is started exactly once and its PATH is taken in.
 */

let cached: string | null = null

const FALLBACK_DIRS = [
  join(homedir(), '.local', 'bin'),
  join(homedir(), '.bun', 'bin'),
  join(homedir(), '.deno', 'bin'),
  join(homedir(), '.cargo', 'bin'),
  join(homedir(), '.volta', 'bin'),
  '/opt/homebrew/bin',
  '/opt/homebrew/sbin',
  '/usr/local/bin',
  '/usr/bin',
  '/bin',
  '/usr/sbin',
  '/sbin'
]

export async function resolveLoginPath(): Promise<string> {
  if (cached) return cached

  const shell = process.env.SHELL || '/bin/zsh'
  const fromShell = await new Promise<string>((resolve) => {
    const child = execFile(
      shell,
      ['-ilc', 'command printf "%s" "$PATH"'],
      { timeout: 5000, encoding: 'utf8' },
      (err, stdout) => resolve(err ? '' : stdout.trim())
    )
    child.on('error', () => resolve(''))
  })

  const parts = new Set<string>()
  for (const p of fromShell.split(delimiter)) {
    if (p.length > 0) parts.add(p)
  }
  for (const p of (process.env.PATH ?? '').split(delimiter)) {
    if (p.length > 0) parts.add(p)
  }
  for (const p of FALLBACK_DIRS) {
    if (existsSync(p)) parts.add(p)
  }

  cached = [...parts].join(delimiter)
  return cached
}

/** Called once at startup to reinforce process.env.PATH. */
export async function primeProcessPath(): Promise<void> {
  process.env.PATH = await resolveLoginPath()
}

/** Does the command exist on PATH? Used to validate an agent definition. */
export function commandExists(command: string, path: string): boolean {
  if (command.includes('/')) return existsSync(command)
  return path.split(delimiter).some((dir) => dir.length > 0 && existsSync(join(dir, command)))
}
