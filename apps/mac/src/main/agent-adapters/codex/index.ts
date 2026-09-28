import { codexCli } from '../../agent-clis/codex.js'
import { invocationFor } from '../../agent-clis/invocation.js'
import { classifyDetachedResult, classifyRunResult } from '../result.js'
import { modelArgument, readLimitScope } from '../limitScope.js'
import type { AgentAdapter } from '../types.js'
import { external } from './external.js'
import { layout } from './layout.js'
import { probeLiveness, resetLiveness } from './liveness.js'
import { CodexSessionParser } from './parser.js'
import { codexSessionId } from './stdout.js'

export const codexAdapter: AgentAdapter = {
  probeLiveness,
  resetLiveness,
  id: 'codex',
  cli: codexCli,
  invoke: invocationFor(codexCli),
  layout,
  external,
  sessionIdInStdout: codexSessionId,

  idleWindowMs: 3 * 60 * 1000,
  // v2: the working directory rides on every message, a command's own `workdir` first
  parserVersion: 'v2',
  createParser: (_namespace, buffer) => new CodexSessionParser(buffer),
  classify: classifyRunResult,
  classifyDetached: classifyDetachedResult,
  limitScope: readLimitScope,
  modelOf: definition => modelArgument(definition.argsTemplate),
  retryAt: () => null
}
