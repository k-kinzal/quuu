import type { LogAdapter } from '../agents/cliAdapter.js'
import { IMPORTABLE_ADAPTERS } from '../agents/cliAdapter.js'
import { adapterFor } from '../agent-adapters/registry.js'
import { NO_LIVENESS as EMPTY } from '../agent-adapters/liveness.js'

export interface LivenessProbe {
  /** Does the session have a liveness marker? It may still be debris from a crash. */
  has(adapter: LogAdapter, sessionId: string): boolean
  /** Was the marker traced down to an actually live process? null when there is no way to trace. */
  confirmed(adapter: LogAdapter, sessionId: string): boolean | null
  /**
   * May we assert "no marker = finished" for this session?
   *
   * Some cases cannot be decided per adapter. Cursor leaves markers only for chats
   * started from cursor-agent, so **within one adapter, assertable and
   * non-assertable sessions (IDE chats) mix**. Hence we look down to the sessionId.
   */
  authoritative(adapter: LogAdapter, sessionId: string): boolean
  /**
   * Is the session known to have finished?
   *
   * Copilot leaves a "finished" marker rather than a "running" one, so this is
   * not the inverse of has(). The finish marker is checked independently so a
   * merely silent session is not dropped to done.
   */
  finished(adapter: LogAdapter, sessionId: string): boolean
}

export function resetLivenessMemo(): void {
 for (const id of IMPORTABLE_ADAPTERS) adapterFor(id).resetLiveness?.()
}
export function probeLiveSessions(now = Date.now()): LivenessProbe {
 const probes = new Map(IMPORTABLE_ADAPTERS.map(id => [id, adapterFor(id).probeLiveness?.(now) ?? EMPTY]))
 return {
  has: (adapter, id) => probes.get(adapter)?.has(id) ?? false,
  confirmed: (adapter, id) => probes.get(adapter)?.confirmed(id) ?? null,
  authoritative: (adapter, id) => probes.get(adapter)?.authoritative(id) ?? false,
  finished: (adapter, id) => probes.get(adapter)?.finished(id) ?? false
 }
}
export const NO_LIVENESS: LivenessProbe = {
  has: () => false,
  confirmed: () => null,
  authoritative: () => false,
  finished: () => false
}
