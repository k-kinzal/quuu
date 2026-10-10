import { piCli } from '../../agent-clis/pi.js'
import { invocationFor } from '../../agent-clis/invocation.js'
import { jsonLogMentions } from '../discovery.js'
import { readHead } from '../external.js'
import { modelArgument } from '../limitScope.js'
import { START_GRACE_MS, closestTo } from '../sessionLookup.js'
import type { AgentAdapter } from '../types.js'
import { external } from './external.js'
import { layout, sessionCandidates } from './layout.js'
import { PiSessionParser } from './parser.js'
import { record } from './records.js'
import { classifyDetachedPiResult, classifyPiResult } from './result.js'

export const piAdapter: AgentAdapter = {
  id: 'pi', cli: piCli, invoke: invocationFor(piCli), layout, external, sessionCandidates,
  logMentions: jsonLogMentions,
  sessionIdInStdout: path => {
    try {
      for (const line of readHead(path).split('\n')) {
        const entry = record(line)
        if (entry.type === 'session' && typeof entry.id === 'string' && entry.id) return entry.id
      }
    } catch { /* The process may not have written its header yet. */ }
    return null
  },
  recoverSessionId: lookup => closestTo(sessionCandidates(lookup.cwd)
    .filter(c => c.bornMs >= lookup.startedAtMs - START_GRACE_MS && !lookup.claimed.has(c.sessionId))
    .map(c => ({ sessionId: c.sessionId, startedAtMs: c.bornMs })), lookup.startedAtMs),
  idleWindowMs: 3 * 60 * 1000,
  parserVersion: 'v1',
  createParser: (namespace, buffer) => new PiSessionParser(namespace, buffer),
  classify: classifyPiResult, classifyDetached: classifyDetachedPiResult,
  // One Pi configuration can route to multiple providers; its CLI identity is not an account.
  limitScope: () => ({ kind: 'unstated' }),
  modelOf: definition => modelArgument(definition.argsTemplate),
  retryAt: () => null
}
