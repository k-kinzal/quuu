import { cursorCli } from '../../agent-clis/cursor.js'
import { invocationFor } from '../../agent-clis/invocation.js'
import { jsonEscaped } from '../discovery.js'
import { classifyDetachedResult, classifyRunResult } from '../result.js'
import { START_GRACE_MS, closestTo } from '../sessionLookup.js'
import { modelArgument } from '../limitScope.js'
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
  parserVersion: 'v3',
  createParser: () => new CursorSessionParser(),
  classify: classifyRunResult,
  classifyDetached: classifyDetachedResult,
  // Cursor's own models and the others are separate allowances, and its limit wording comes from its
  // server - no sample has been seen yet. Reading one pool running out as the whole account would
  // idle the definitions on the other pool that still have room, so a limit holds back only the one
  // that met it until that wording is known
  limitScope: () => ({ kind: 'unstated' }),
  modelOf: definition => modelArgument(definition.argsTemplate),
  retryAt: () => null
}
