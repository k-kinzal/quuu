import { spawnSync } from 'node:child_process'
import { nativeHelperPath } from './nativeHelpers.js'

/**
 * Two facts about other processes that Node cannot answer, each asked the way its OS answers it:
 * macOS with its stock `ps` and `lockf`, Windows with the probe Quuu ships (native/quuu-probe-win.c).
 * A probe that cannot run answers null or false, never a guess that something is alive.
 */

/** When the process started (ms since the epoch), to tell a live pid from a reused one. */
export function processStartedAt(pid: number): number | null {
  if (process.platform === 'win32') {
    const probe = nativeHelperPath('quuu-probe')
    if (!probe) return null
    const result = spawnSync(probe, ['start-time', String(pid)], { encoding: 'utf8', timeout: 500, windowsHide: true })
    if (result.error || result.status !== 0) return null
    const startedAt = Number(result.stdout.trim())
    return Number.isFinite(startedAt) ? startedAt : null
  }
  const result = spawnSync('/bin/ps', ['-p', String(pid), '-o', 'lstart='], {
    encoding: 'utf8',
    env: { ...process.env, LC_ALL: 'C' },
    timeout: 500
  })
  if (result.error || result.signal || result.status !== 0) return null
  const startedAt = Date.parse(result.stdout.trim())
  // ps reports whole seconds; callers compare with that rounding in mind
  return Number.isFinite(startedAt) ? startedAt : null
}

/**
 * Does another process hold an exclusive lock on this file? null when it cannot be told.
 *
 * Both probes try to take the same lock without waiting, and never create or delete the file.
 * EX_TEMPFAIL (75, sysexits.h) is the definitive "already held" on both.
 */
export function fileLockHeld(path: string): boolean | null {
  const probe = process.platform === 'win32' ? nativeHelperPath('quuu-probe') : '/usr/bin/lockf'
  if (!probe) return null
  const args = process.platform === 'win32' ? ['lock-held', path] : ['-k', '-n', '-s', '-t', '0', path, '/usr/bin/true']
  const result = spawnSync(probe, args, { stdio: 'ignore', timeout: 500, windowsHide: true })
  if (result.status === 75) return true
  if (result.status === 0) return false
  return null
}
