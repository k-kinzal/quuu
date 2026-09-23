import type { RunStatus } from '../tasks/status.js'
import type { RunErrorKind } from './types.js'
export type { Classification } from '../agent-adapters/result.js'

export function runStatusForKind(kind: RunErrorKind | null): RunStatus {
  switch (kind) {
    case null:
      return 'succeeded'
    case 'limit':
      return 'limited'
    case 'canceled':
      return 'canceled'
    case 'timeout':
      return 'timeout'
    default:
      return 'failed'
  }
}
