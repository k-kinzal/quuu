import { grokCli } from '../../agent-clis/grok.js'
import { invocationFor } from '../../agent-clis/invocation.js'
import { classifyDetachedResult, classifyRunResult } from '../result.js'
import { START_GRACE_MS, closestTo } from '../sessionLookup.js'
import type { AgentAdapter } from '../types.js'
import { external } from './external.js'
import {
  layout,
  sessionCandidates
} from './layout.js'
import { GrokSessionParser } from './parser.js'

export const grokAdapter: AgentAdapter = {
  id: 'grok',
  cli: grokCli,
  invoke: invocationFor(grokCli),
  layout,
  sessionCandidates,
  external,
  recoverSessionId: lookup => closestTo(sessionCandidates(lookup.cwd)
    .filter(candidate => candidate.bornMs >= lookup.startedAtMs - START_GRACE_MS && !lookup.claimed.has(candidate.sessionId))
    .map(candidate => ({ sessionId: candidate.sessionId, startedAtMs: candidate.bornMs })), lookup.startedAtMs),

  idleWindowMs: 3 * 60 * 1000,
  parserVersion: 'v1',
  createParser: (_namespace, buffer) => new GrokSessionParser(buffer),
  classify: classifyRunResult,
  classifyDetached: classifyDetachedResult,
  retryAt: () => null
}
