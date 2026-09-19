import { arr, asRecord, fail, num, str, versionOk, type ParseResult } from './json.js'
import type { SyncReceipts } from './protocol.js'
import { SYNC_VERSION } from './protocol.js'


export function parseReceipts(text: string): ParseResult<SyncReceipts> {
  const r = asRecord(text)
  if (!r.ok) return r
  const o = r.value
  if (!versionOk(o.version)) return fail('unreadable version')
  return {
    ok: true,
    value: {
      version: num(o.version, SYNC_VERSION),
      updatedAt: str(o.updatedAt),
      entries: arr(o.entries).flatMap((e) => {
        const x = e as Record<string, unknown>
        if (typeof x?.intentId !== 'string') return []
        const outcome = str(x.outcome)
        if (!['applied', 'skipped', 'deferred', 'conflict'].includes(outcome)) return []
        return [
          {
            intentId: x.intentId,
            device: str(x.device),
            seq: num(x.seq),
            taskId: str(x.taskId),
            at: str(x.at),
            outcome: outcome as SyncReceipts['entries'][number]['outcome'],
            reason: str(x.reason)
          }
        ]
      })
    }
  }
}