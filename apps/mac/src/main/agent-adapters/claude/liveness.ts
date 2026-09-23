import {
  readdirSync,
  readFileSync
} from 'node:fs'
import { join } from 'node:path'
import { claudeSessionsDir } from '../../appPaths.js'
import { isProcessAlive, NO_LIVENESS, type Probed, type ProviderLiveness } from '../liveness.js'
let proven = false
export function resetLiveness(): void { proven = false }
export function probeLiveness(): ProviderLiveness {
  const found = probeClaude()
  if (found.ids.size) proven = true
  return { ...NO_LIVENESS, has: id => found.ids.has(id), confirmed: id => found.ids.has(id), authoritative: () => found.present && proven }
}

// ---------------------------------------------------------------------------

function probeClaude(): Probed {
  const dir = claudeSessionsDir()
  const ids = new Set<string>()
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return { ids, present: false }
  }

  for (const name of names) {
    if (!name.endsWith('.json')) continue
    let entry: { pid?: unknown; sessionId?: unknown }
    try {
      entry = JSON.parse(readFileSync(join(dir, name), 'utf8')) as typeof entry
    } catch {
      continue
    }
    if (typeof entry.pid !== 'number' || typeof entry.sessionId !== 'string') continue
    // pid files can be left behind by crashes, so verify the process is actually alive
    if (!isProcessAlive(entry.pid)) continue
    ids.add(entry.sessionId)
  }
  return { ids, present: true }
}