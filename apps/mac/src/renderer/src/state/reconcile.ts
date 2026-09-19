import type { AppSnapshot } from '../../../preload/api/snapshot.js'

/** Structural equality for the plain JSON that crosses IPC. */
export function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, index) => sameValue(item, b[index]))
  }
  const left = a as Record<string, unknown>
  const right = b as Record<string, unknown>
  const keys = Object.keys(left)
  return keys.length === Object.keys(right).length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(right, key) && sameValue(left[key], right[key]))
}

function keep<T>(previous: T, next: T): T {
  return sameValue(previous, next) ? previous : next
}

/** Rows that read the same keep their object; a list whose rows all did keeps its array. */
function keepRows<T extends { id: string }>(previous: T[], next: T[]): T[] {
  const before = new Map(previous.map((row) => [row.id, row]))
  const rows = next.map((row) => {
    const old = before.get(row.id)
    return old && sameValue(old, row) ? old : row
  })
  return rows.length === previous.length && rows.every((row, index) => row === previous[index]) ? previous : rows
}

/**
 * Main sends the whole picture every time; the screens want to know what moved.
 *
 * Everything that reads the same as before keeps the object it already had, so memoised
 * views and per-slice subscribers stay quiet, and a picture with nothing new is the
 * previous one itself, which is how a redraw of every list is avoided.
 */
export function reconcileSnapshot(previous: AppSnapshot | null, next: AppSnapshot): AppSnapshot {
  if (!previous) return next
  const merged: AppSnapshot = {
    ...next,
    projects: keepRows(previous.projects, next.projects),
    tasks: keepRows(previous.tasks, next.tasks),
    rules: keepRows(previous.rules, next.rules),
    agents: keepRows(previous.agents, next.agents),
    groups: keepRows(previous.groups, next.groups),
    runs: keepRows(previous.runs, next.runs),
    scheduler: keep(previous.scheduler, next.scheduler)
  }
  if (next.resumeCommands) merged.resumeCommands = keep(previous.resumeCommands, next.resumeCommands)
  if (next.externalAgentNames) merged.externalAgentNames = keep(previous.externalAgentNames, next.externalAgentNames)
  const keys = new Set([...Object.keys(previous), ...Object.keys(merged)]) as Set<keyof AppSnapshot>
  for (const key of keys) if (merged[key] !== previous[key]) return merged
  return previous
}
