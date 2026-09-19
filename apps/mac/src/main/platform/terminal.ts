import { chmodSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { terminalScriptDir, terminalScriptPath } from '../appPaths.js'
import { launch } from './launch.js'
import { resolveLoginPath } from './shellEnv.js'

/**
 * Open the stock macOS Terminal.
 *
 * We want it opened with a command already running, but no instruction can be sent (`launch.ts`:
 * why AppleScript is not used). Instead, **write what should run into a script file and hand that
 * to `open`**. Terminal treats a `.command` as "open = run", which is enough.
 * What was handed over stays in the file, so what was launched can be read back later.
 */

/** Roughly when a launch script gets cleaned up. Removed on the way past, next time one opens. */
const SCRIPT_TTL_MS = 24 * 60 * 60 * 1000

/**
 * One word handed to the shell.
 *
 * A working directory or a task name can contain spaces, quotes and `$`.
 * Wrap in single quotes and escape only the single quotes inside (the one safe form in POSIX sh).
 */
export function shQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`
}

export interface TerminalCommand {
  cwd: string
  command: string
  args: string[]
  /** The name shown in the window's title bar. Let the window say what it opened. */
  title: string
}

/**
 * The script handed to Terminal.
 *
 * - PATH is the one Quuu took from a login shell. The PATH a GUI-launched Quuu holds cannot even
 *   find `claude` (the same reason as `shellEnv.ts`)
 * - It `exec`s a login shell at the end. **The window survives the agent finishing**, because
 *   typing `git diff` right after it ends is where this operation mostly leads
 */
export function terminalScript(
  input: TerminalCommand & { path: string; shell: string }
): string {
  const argv = [input.command, ...input.args].map(shQuote).join(' ')
  return [
    '#!/bin/sh',
    '# A launch script written by Quuu. Safe to delete once the window is closed.',
    `cd ${shQuote(input.cwd)} || exit 1`,
    `PATH=${shQuote(input.path)}`,
    'export PATH',
    `printf '\\033]0;%s\\007' ${shQuote(input.title)}`,
    argv,
    '# Keep the shell after the agent finishes (this window exists to keep typing in)',
    `exec ${shQuote(input.shell)} -l`,
    ''
  ].join('\n')
}

/** Just open the directory. Terminal provides the login shell. */
export async function openTerminalAt(cwd: string): Promise<void> {
  await launch(['-a', 'Terminal', cwd])
}

/** Open a terminal in that directory with one command already running. */
export async function openTerminalWith(id: string, input: TerminalCommand): Promise<void> {
  const script = terminalScript({
    ...input,
    path: await resolveLoginPath(),
    shell: process.env.SHELL || '/bin/zsh'
  })
  const path = terminalScriptPath(id)
  writeFileSync(path, script, 'utf8')
  // Terminal will not open a file without the execute bit (it tries and is refused)
  chmodSync(path, 0o700)
  pruneScripts(path)
  await launch(['-a', 'Terminal', path])
}

/** Throw away old launch scripts. The one being handed over now is kept. */
function pruneScripts(keep: string): void {
  const dir = terminalScriptDir()
  const limit = Date.now() - SCRIPT_TTL_MS
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return
  }
  for (const name of names) {
    const path = join(dir, name)
    if (path === keep) continue
    try {
      if (statSync(path).mtimeMs < limit) rmSync(path, { force: true })
    } catch {
      // Failing to delete has nothing to do with the launch itself
    }
  }
}
