import {
  readdirSync
} from 'node:fs'
import { join } from 'node:path'
import { codexLocksDir } from '../../appPaths.js'
import { fileLockHeld } from '../../platform/processProbe.js'
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
      /*
       * Codex's lock is an empty file, so exit cannot be read from its contents. Trusting mere
       * existence leaves crash debris running forever; cutting on silence alone drops a session
       * to done mid long tool call. Trying to take the same lock answers it: held means alive.
       */
      if (!lockStates.has(path)) lockStates.set(path, fileLockHeld(path))
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
