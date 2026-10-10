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
import { claudeLimitScope, claudeModel } from './limitScope.js'
import { weeklyLimitLiftsAt } from './weeklyWindow.js'

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
  // v2: the working directory rides on every message
  parserVersion: 'v3',
  createParser: (namespace, buffer) => new ClaudeSessionParser(namespace, buffer),
  classify: classifyClaudeResult,
  classifyDetached: classifyDetachedClaudeResult,
  limitScope: claudeLimitScope,
  modelOf: claudeModel,
  // The account's own windows print their moment; a model's share of the week never does
  retryAt: (scope, history) => scope.kind === 'model' ? weeklyLimitLiftsAt(history, scope.model) : null
}
