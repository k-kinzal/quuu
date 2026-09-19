import type { SyncIntent } from './protocol.js'

/**
 * Reorders arrived intents back into the order they were pressed in.
 *
 * **iCloud does not guarantee the order files arrive in.** Drop three at once and
 * the middle one can land first. Applying them as they arrive turns
 * "queue -> done" into "done -> queue": the done is rejected and the queued one stays.
 *
 * Within one device `seq` increases monotonically, so that is treated as absolute
 * order. Across devices the ordering is interleaved by time, but the times are
 * **first smoothed to be monotonically increasing per device** so a device whose
 * clock jumped backwards cannot drag the others along.
 */
export function orderIntents(intents: SyncIntent[]): SyncIntent[] {
  const byDevice = new Map<string, SyncIntent[]>()
  for (const intent of intents) {
    const list = byDevice.get(intent.device)
    if (list) list.push(intent)
    else byDevice.set(intent.device, [intent])
  }

  // Ascending seq per device. Times are then smoothed upward (absorbing any rollback)
  const stamped = new Map<string, string>()
  for (const list of byDevice.values()) {
    list.sort((a, b) => a.seq - b.seq)
    let high = ''
    for (const intent of list) {
      if (intent.createdAt > high) high = intent.createdAt
      stamped.set(key(intent), high)
    }
  }

  return [...intents].sort((a, b) => {
    const ta = stamped.get(key(a)) ?? a.createdAt
    const tb = stamped.get(key(b)) ?? b.createdAt
    if (ta !== tb) return ta < tb ? -1 : 1
    if (a.device !== b.device) return a.device < b.device ? -1 : 1
    return a.seq - b.seq
  })
}

/** A Map key. NUL separates the parts so no device name or id can forge another key. */
function key(intent: SyncIntent): string {
  return `${intent.device}\0${intent.seq}\0${intent.id}`
}

/**
 * Whether any intent has not arrived yet (a gap in `seq`).
 *
 * **Do not wait.** The missing ones may never come, so stopping until the run is
 * complete stops everything. Apply what has arrived, in order; anything that lands
 * late is rejected by the `expect` check (that is what `expect` is for).
 * What this returns exists only to tell the screen "some have not arrived yet".
 */
export function missingSeqs(intents: SyncIntent[], appliedMax: Map<string, number>): number {
  let missing = 0
  const byDevice = new Map<string, number[]>()
  for (const intent of intents) {
    const list = byDevice.get(intent.device)
    if (list) list.push(intent.seq)
    else byDevice.set(intent.device, [intent.seq])
  }
  for (const [device, seqs] of byDevice) {
    seqs.sort((a, b) => a - b)
    let prev = appliedMax.get(device) ?? seqs[0] - 1
    for (const seq of seqs) {
      if (seq > prev + 1) missing += seq - prev - 1
      prev = seq
    }
  }
  return missing
}
