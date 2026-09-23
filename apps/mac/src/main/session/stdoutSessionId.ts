import type { LogAdapter } from '../agents/cliAdapter.js'
import { adapterFor } from '../agent-adapters/registry.js'

export function sessionIdInStdout(logPath: string, adapter: LogAdapter = 'stdout'): string | null {
 return adapterFor(adapter).sessionIdInStdout?.(logPath) ?? null
}
