import type { SyncAppFile, SyncAppManifest } from './appUpdates.js'
import { emptyAppManifest } from './appUpdates.js'
import { asRecord, fail, num, str, type ParseResult } from './json.js'
import { SYNC_VERSION } from './protocol.js'



/**
 * The manifest for a screen delivery.
 *
 * If this cannot be read, **do nothing** (keep running the baked-in screens).
 * A broken delivery must never stop the app already in hand.
 */
export function parseAppManifest(text: string): ParseResult<SyncAppManifest> {
  const root = asRecord(text)
  if (!root.ok) return root
  const r = root.value

  const version = num(r.version)
  if (version !== SYNC_VERSION) return fail(`unknown version (${version})`)

  const raw = Array.isArray(r.files) ? r.files : []
  const files: SyncAppFile[] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    const f = item as Record<string, unknown>
    const path = str(f.path)
    const hash = str(f.hash)
    // Drop names pointing outside the manifest (they become file paths on the receiving side)
    if (!path || !hash || path.startsWith('/') || path.includes('..')) continue
    files.push({ path, hash, bytes: num(f.bytes) })
  }
  if (files.length === 0) return fail('no files')

  return {
    ok: true,
    value: { ...emptyAppManifest(), build: str(r.build), publishedAt: str(r.publishedAt), files }
  }
}