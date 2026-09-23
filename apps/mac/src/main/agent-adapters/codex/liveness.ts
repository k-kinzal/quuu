import { spawnSync } from 'node:child_process'
import {
  readdirSync
} from 'node:fs'
import { join } from 'node:path'
import { codexLocksDir } from '../../appPaths.js'
import { NO_LIVENESS, type Probed, type ProviderLiveness } from '../liveness.js'
let proven = false
export function resetLiveness(): void { proven = false }
export function probeLiveness(): ProviderLiveness {
  const found = probeCodex()
  if (found.ids.size) proven = true
  const lockStates = new Map<string, boolean | null>()
  return {
    ...NO_LIVENESS, has: id => found.ids.has(id),
    confirmed: id => {
      const path = found.paths.get(id)
      if (!path) return false
      if (!lockStates.has(path)) lockStates.set(path, codexLockHeld(path))
      return lockStates.get(path) ?? null
    }, authoritative: () => found.present && proven
  }
}

interface CodexProbed extends Probed {
  paths: Map<string, string>
}

function probeCodex(): CodexProbed {
  const dir = codexLocksDir()
  const ids = new Set<string>()
  const paths = new Map<string, string>()
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return { ids, paths, present: false }
  }

  for (const name of names) {
    // Exclude internals like `.coordination.lock`
    if (name.startsWith('.') || !name.endsWith('.lock')) continue
    const id = name.slice(0, -'.lock'.length)
    ids.add(id)
    paths.set(id, join(dir, name))
  }
  return { ids, paths, present: true }
}

/**
 * Does a Codex process hold the exclusive file lock?
 *
 * Codex's lock is an empty file, so exit cannot be read from its contents. Trusting
 * mere existence leaves crash debris running forever; cutting on silence alone drops
 * a session to done mid long tool call. We try to acquire the same lock with macOS's
 * stock lockf: if it is already held, the session is alive. `-n -k` avoids creating
 * or deleting the file even on contention.
 */
function codexLockHeld(path: string): boolean | null {
  const result = spawnSync('/usr/bin/lockf', ['-k', '-n', '-s', '-t', '0', path, '/usr/bin/true'], {
    stdio: 'ignore',
    timeout: 500
  })
  // EX_TEMPFAIL (75) from sysexits.h is the definitive answer: another process already holds it.
  if (result.status === 75) return true
  if (result.status === 0) return false
  return null
}