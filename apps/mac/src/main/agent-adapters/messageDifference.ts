import { isDeepStrictEqual } from 'node:util'
import type { SessionMessage } from '../session/types.js'

export function firstDifference(before: SessionMessage[], after: SessionMessage[]): number {
  const shared = Math.min(before.length, after.length)
  for (let i = 0; i < shared; i += 1) {
    if (!sameMessage(before[i], after[i])) return i
  }
  if (after.length > before.length) return before.length
  // Shrunk (a rewind). Re-paste from where it shrank.
  if (after.length < before.length) return after.length
  return -1
}

function sameMessage(a: SessionMessage, b: SessionMessage): boolean {
  // A running call can change its arguments or error state before its result text changes.
  return isDeepStrictEqual(a, b)
}
