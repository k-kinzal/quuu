import { randomUUID } from 'node:crypto'
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { isProcessAlive } from '../platform/runProcess.js'

function identity(pid: number): string | null {
  if (process.platform !== 'linux') return isProcessAlive(pid) ? String(pid) : null
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
    return `${readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim()}:${stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19]}`
  } catch { return null }
}
export function recordProcess(path: string, pid: number): void {
  const temporary = `${path}.${randomUUID()}.tmp`
  writeFileSync(temporary, JSON.stringify({ pid, identity: identity(pid) }), { mode: 0o600 })
  renameSync(temporary, path)
}
/** A reused PID after container restart must never identify a previous job. */
export function recordedProcess(path: string): number | null {
  try {
    const record = JSON.parse(readFileSync(path, 'utf8')) as { pid: number; identity: string | null }
    return record.identity && identity(record.pid) === record.identity && isProcessAlive(record.pid) ? record.pid : null
  } catch { return null }
}
