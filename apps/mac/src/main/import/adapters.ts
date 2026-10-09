import type { DiscoverOptions, ExternalSession } from '../agent-adapters/external.js'
import { adapterFor } from '../agent-adapters/registry.js'
import { IMPORTABLE_ADAPTERS } from '../agents/cliAdapter.js'
import { setImmediate as yieldToApp } from 'node:timers/promises'
import type { ExternalFile, ExternalLogs } from '../agent-adapters/external.js'
export { startedByProgram } from '../agent-adapters/external.js'
export type { ExternalSession } from '../agent-adapters/external.js'

/** Import policy receives normalized sessions, never native provider records. */
export function discoverSessions(options: DiscoverOptions): ExternalSession[] {
 const scan = discover(options)
 let step = scan.next()
 while (!step.done) step = scan.next()
 return step.value
}

/** Timers still run on Electron's main thread; yield between providers and individual log reads. */
export async function discoverSessionsInBackground(options: DiscoverOptions, active: () => boolean): Promise<ExternalSession[]> {
 const scan = discover(options)
 while (true) {
  await yieldToApp()
  if (!active()) return []
  const step = scan.next()
  if (step.done) return step.value
 }
}

function* discover(options: DiscoverOptions): Generator<void, ExternalSession[]> {
 const files: Array<{ file: ExternalFile; source: ExternalLogs }> = []
 for (const id of IMPORTABLE_ADAPTERS) {
  const source = adapterFor(id).external
  if (source) for (const file of source.files(options)) files.push({ file, source })
  yield
 }
 files.sort((a, b) => b.file.mtimeMs - a.file.mtimeMs)
 const sessions: ExternalSession[] = []
 for (const { file, source } of files) {
  if (sessions.length >= options.limit) break
  try {
   const session = source.read(file)
   if (session) sessions.push(session)
  } catch { /* One broken external log must not prevent importing the others. */ }
  yield
 }
 return sessions
}
