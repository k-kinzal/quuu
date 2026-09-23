import { invocationFor } from '../../agent-clis/invocation.js'
import { StdoutSessionParser } from '../../session/stdoutParser.js'
import { codexSessionId } from '../codex/stdout.js'
import { classifyDetachedResult, classifyRunResult } from '../result.js'
import type { AgentAdapter } from '../types.js'
import { layout } from './layout.js'
const stdoutCli = null

export const stdoutAdapter: AgentAdapter = {
  id: 'stdout',
  cli: stdoutCli,
  invoke: invocationFor(stdoutCli),
  layout,
  sessionIdInStdout: codexSessionId,

  idleWindowMs: 3 * 60 * 1000,
  parserVersion: 'v1',
  createParser: (_namespace, buffer) => new StdoutSessionParser(buffer),
  classify: classifyRunResult,
  classifyDetached: classifyDetachedResult,
  retryAt: () => null
}
