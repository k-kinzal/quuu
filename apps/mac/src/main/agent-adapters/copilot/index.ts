import { copilotCli } from '../../agent-clis/copilot.js'
import { invocationFor } from '../../agent-clis/invocation.js'
import { classifyDetachedResult, classifyRunResult } from '../result.js'
import type { AgentAdapter } from '../types.js'
import { external } from './external.js'
import { findCopilotSessionId } from './identity.js'
import { layout } from './layout.js'
import { probeLiveness } from './liveness.js'
import { CopilotSessionParser } from './parser.js'

export const copilotAdapter: AgentAdapter = {
  probeLiveness,
  id: 'copilot',
  cli: copilotCli,
  invoke: invocationFor(copilotCli),
  layout,
  external,
  recoverSessionId: findCopilotSessionId,

  idleWindowMs: 3 * 60 * 1000,
  parserVersion: 'v1',
  createParser: (_namespace, buffer) => new CopilotSessionParser(buffer),
  classify: classifyRunResult,
  classifyDetached: classifyDetachedResult,
  retryAt: () => null
}
