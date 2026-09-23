import { claudeCli } from '../../agent-clis/claude.js'
import { invocationFor } from '../../agent-clis/invocation.js'
import type { AgentAdapter } from '../types.js'
import { external } from './external.js'
import { findClaudeSessionId } from './identity.js'
import {
  layout,
  sessionCandidates
} from './layout.js'
import { probeLiveness, resetLiveness } from './liveness.js'
import { ClaudeSessionParser } from './parser.js'
import { classifyClaudeResult, classifyDetachedClaudeResult } from './result.js'
import { isModelLimit, weeklyLimitLiftsAt } from './weeklyWindow.js'

export const claudeAdapter: AgentAdapter = {
  probeLiveness,
  resetLiveness,
  id: 'claude',
  cli: claudeCli,
  invoke: invocationFor(claudeCli),
  layout,
  sessionCandidates,
  external,
  recoverSessionId: findClaudeSessionId,

  idleWindowMs: 3 * 60 * 1000,
  parserVersion: 'v1',
  createParser: (namespace, buffer) => new ClaudeSessionParser(namespace, buffer),
  classify: classifyClaudeResult,
  classifyDetached: classifyDetachedClaudeResult,
  retryAt: (result, history) => result.kind === 'limit' && isModelLimit(result.message) ? weeklyLimitLiftsAt(history) : null
}
