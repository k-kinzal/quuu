import { cursorCli } from '../../agent-clis/cursor.js'
import { invocationFor } from '../../agent-clis/invocation.js'
import { jsonEscaped } from '../discovery.js'
import { classifyDetachedResult, classifyRunResult } from '../result.js'
import { START_GRACE_MS, closestTo } from '../sessionLookup.js'
import type { AgentAdapter } from '../types.js'
import { external } from './external.js'
import { layout, sessionCandidates } from './layout.js'
import { probeLiveness } from './liveness.js'
import { CursorSessionParser } from './parser.js'
import { readCursorChat } from './store.js'

export const cursorAdapter: AgentAdapter = {
  probeLiveness,
  id: 'cursor',
  cli: cursorCli,
  invoke: invocationFor(cursorCli),
  layout,
  sessionCandidates,
  logMentions: (candidate, head) => readCursorChat(candidate.logPath, candidate.sessionId)?.messages.some(
    message => message.role === 'user' && JSON.stringify(message.content).includes(jsonEscaped(head))
  ) ?? false,
  external,
  recoverSessionId: lookup => closestTo(sessionCandidates(lookup.cwd)
    .filter(candidate => candidate.bornMs >= lookup.startedAtMs - START_GRACE_MS && !lookup.claimed.has(candidate.sessionId))
    .map(candidate => ({ sessionId: candidate.sessionId, startedAtMs: candidate.bornMs })), lookup.startedAtMs),

  idleWindowMs: 10 * 60 * 1000,
  parserVersion: 'v2',
  createParser: () => new CursorSessionParser(),
  classify: classifyRunResult,
  classifyDetached: classifyDetachedResult,
  retryAt: () => null
}
