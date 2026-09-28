import type { Turn } from './summarize.js'

/** Where timed entries sit among the conversation's turns. */
export interface Placement<T> {
  /** Before the first turn in the window. */
  before: T[]
  /** Right after the turn with this id, which is not the window's last. */
  after: Map<string, T[]>
  /** After the window's last turn. */
  end: T[]
}

/**
 * Lay entries that happened beside the conversation (hook runs, the report) into it by time.
 *
 * An entry goes after the last turn that began no later than it. A turn without a time
 * takes the one before it, so a log without timestamps keeps every entry at its end.
 * Where the window stops short of the conversation's edge, what lies beyond it belongs
 * to a page that is not loaded, so it is left out rather than piled at the window's edge.
 */
export function placeByTime<T extends { at: string }>(
  turns: Turn[], entries: T[], window: { older: boolean; newer: boolean }
): Placement<T> {
  const placement: Placement<T> = { before: [], after: new Map(), end: [] }
  let known = Number.NEGATIVE_INFINITY
  const times = turns.map(turn => {
    const at = turn.startedAt ? Date.parse(turn.startedAt) : Number.NaN
    if (!Number.isNaN(at)) known = at
    return known
  })
  for (const entry of [...entries].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) {
    const at = Date.parse(entry.at)
    let index = times.length - 1
    while (index >= 0 && times[index] > at) index--
    if (index < 0 && turns.length) {
      if (!window.older) placement.before.push(entry)
    } else if (index === turns.length - 1) {
      if (!window.newer) placement.end.push(entry)
    } else {
      const id = turns[index].id
      placement.after.set(id, [...placement.after.get(id) ?? [], entry])
    }
  }
  return placement
}
