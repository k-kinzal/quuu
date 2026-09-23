import type { DiscoverOptions, ExternalSession } from '../agent-adapters/external.js'
import { adapterFor } from '../agent-adapters/registry.js'
import { IMPORTABLE_ADAPTERS } from '../agents/cliAdapter.js'
export { startedByProgram } from '../agent-adapters/external.js'
export type { ExternalSession } from '../agent-adapters/external.js'

/** Import policy receives normalized sessions, never native provider records. */
export function discoverSessions(options: DiscoverOptions): ExternalSession[] {
 const files = IMPORTABLE_ADAPTERS.flatMap(id => {
  const source = adapterFor(id).external
  return source ? source.files(options).map(file => ({ file, source })) : []
 }).sort((a, b) => b.file.mtimeMs - a.file.mtimeMs)
 const sessions: ExternalSession[] = []
 for (const { file, source } of files) {
  if (sessions.length >= options.limit) break
  try {
   const session = source.read(file)
   if (session) sessions.push(session)
  } catch { /* One broken external log must not prevent importing the others. */ }
 }
 return sessions
}
