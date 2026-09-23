import { adapterFor } from '../agent-adapters/registry.js'
import type { SessionLookup } from '../agent-adapters/sessionLookup.js'
import type { LogAdapter } from '../agents/cliAdapter.js'
export type { SessionLookup } from '../agent-adapters/sessionLookup.js'

export function argsCarrySessionId(args: string[], sessionId: string): boolean {
  return args.some((a) => a.includes(sessionId))
}
export function canRecoverSessionId(adapter: LogAdapter): boolean { return adapterFor(adapter).recoverSessionId !== undefined }
export function findSessionId(adapter: LogAdapter, lookup: SessionLookup): string | null { return adapterFor(adapter).recoverSessionId?.(lookup) ?? null }
