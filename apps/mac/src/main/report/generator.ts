import { spawn } from 'node:child_process'
import { closeSync, openSync, writeSync } from 'node:fs'
import { nowIso } from '../util.js'

/**
 * What the sh wrapper around the report generator does.
 *
 * The same shape a task run uses (`execution/runner.ts`): leave the exit code in a file, then
 * exit with it. A report can take longer than the gap between two Quuu restarts, and a
 * generation that ends while the app is gone still has to be settled on the next launch.
 */
const WRAPPER =
  '"$@"; __quuu_code=$?; printf %s "$__quuu_code" > "$QUUU_EXIT_FILE" 2>/dev/null; exit $__quuu_code'

export interface ReportLaunch {
  command: string
  args: string[]
  env: NodeJS.ProcessEnv
  cwd: string
  /** Where the generator's own output goes. */
  log: string
  exitPath: string
}

/**
 * Start the generator and return its pid.
 *
 * Detached, with output wired straight to the log file's fd — the same two properties that keep
 * a task's agent alive across a restart. A report is not worth losing a run over, but a
 * generator killed halfway leaves a half-written page, and half a report reads like a whole one.
 */
export function spawnReport(launch: ReportLaunch): number {
  const fd = openSync(launch.log, 'a')
  try {
    writeSync(fd, `# Quuu report\n# ${nowIso()}\n# cwd: ${launch.cwd}\n# cmd: ${launch.command}\n\n`)
  } catch {
    // Keep going even if the header could not be written
  }
  try {
    const child = spawn('/bin/sh', ['-c', WRAPPER, 'Quuu', launch.command, ...launch.args], {
      cwd: launch.cwd,
      env: launch.env,
      stdio: ['ignore', fd, fd],
      detached: true,
      shell: false
    })
    child.unref()
    if (child.pid === undefined) throw new Error('the report generator did not start')
    return child.pid
  } finally {
    // The child holds its own copy, so writing continues after this fd is gone
    closeSync(fd)
  }
}

/** What can be observed about a generation from outside it. */
export interface ReportObservation {
  alive: boolean
  /** The recorded exit code. null when the generator left none. */
  exitCode: number | null
  pageExists: boolean
  timedOut: boolean
}

export interface ReportSettlement {
  status: 'ready' | 'failed'
  /** Empty when there is nothing odd to say. */
  reason: 'timeout' | 'exit' | 'no-page' | ''
  exitCode: number | null
}

/**
 * How a generation ends. null means it has not ended.
 *
 * **The page is the contract.** A generator that wrote one did the job, so a non-zero exit does
 * not throw the page away — it is kept as a note beside it. CLIs exit non-zero for reasons that
 * have nothing to do with the work (a cleanup step, a broken pipe at the end), and discarding a
 * finished report over one leaves the reviewer with nothing at all.
 */
export function settleReport(observed: ReportObservation): ReportSettlement | null {
  if (observed.timedOut) return { status: 'failed', reason: 'timeout', exitCode: observed.exitCode }
  if (observed.alive) return null
  if (observed.pageExists) {
    const odd = observed.exitCode !== null && observed.exitCode !== 0
    return { status: 'ready', reason: odd ? 'exit' : '', exitCode: observed.exitCode }
  }
  return { status: 'failed', reason: 'no-page', exitCode: observed.exitCode }
}
