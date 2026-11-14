import { spawn } from 'node:child_process'
import { capturedLaunch } from '../platform/detachedLaunch.js'

export interface ReportLaunch {
  command: string
  args: string[]
  env: NodeJS.ProcessEnv
  cwd: string
  /** Where the generator's own output goes. */
  log: string
  exitPath: string
}

/** A bounded collector owns output independently of the desktop's lifetime. */
export function spawnReport(launch: ReportLaunch): number {
  const wrapped = capturedLaunch([launch.command, ...launch.args], launch.log)
  const child = spawn(wrapped.command, wrapped.args, {
    cwd: launch.cwd,
    env: { ...launch.env, QUUU_EXIT_FILE: launch.exitPath, ...wrapped.env },
    stdio: 'ignore', detached: true, shell: false, windowsHide: true
  })
  child.on('error', error => { console.error('Report collector could not start', error) })
  child.unref()
  if (child.pid === undefined) throw new Error('the report generator did not start')
  return child.pid
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
