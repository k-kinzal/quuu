import { invocationFor } from '../../agent-clis/invocation.js'
import { opencodeCli } from '../../agent-clis/opencode.js'
import { classifyDetachedResult, classifyRunResult } from '../result.js'
import type { AgentAdapter } from '../types.js'
import { external } from './external.js'
import { findOpencodeSessionId } from './identity.js'
import { layout } from './layout.js'
import { probeLiveness } from './liveness.js'
import { OpencodeSessionParser } from './parser.js'

export const opencodeAdapter: AgentAdapter = {
  probeLiveness,
  id: 'opencode',
  cli: opencodeCli,
  invoke: invocationFor(opencodeCli),
  layout,
  external,
  recoverSessionId: findOpencodeSessionId,

  idleWindowMs: 3 * 60 * 1000,
  parserVersion: 'v1',
  createParser: () => new OpencodeSessionParser(),
  classify: classifyRunResult,
  classifyDetached: classifyDetachedResult,
  retryAt: () => null
}
