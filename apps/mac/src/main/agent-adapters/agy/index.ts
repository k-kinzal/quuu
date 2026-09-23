import { agyCli } from '../../agent-clis/agy.js'
import { invocationFor } from '../../agent-clis/invocation.js'
import { classifyDetachedResult, classifyRunResult } from '../result.js'
import type { AgentAdapter } from '../types.js'
import { external } from './external.js'
import { layout } from './layout.js'
import { AgySessionParser } from './parser.js'
import { agyConversationId } from './stdout.js'

export const agyAdapter: AgentAdapter = {
  id: 'agy',
  cli: agyCli,
  invoke: invocationFor(agyCli),
  layout,
  external,
  sessionIdInStdout: agyConversationId,

  idleWindowMs: 3 * 60 * 1000,
  parserVersion: 'v1',
  createParser: (_namespace, buffer) => new AgySessionParser(buffer),
  classify: classifyRunResult,
  classifyDetached: classifyDetachedResult,
  retryAt: () => null
}
