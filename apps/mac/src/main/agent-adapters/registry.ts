import type { LogAdapter } from '../agents/cliAdapter.js'
import { agyAdapter } from './agy/index.js'
import { claudeAdapter } from './claude/index.js'
import { codexAdapter } from './codex/index.js'
import { copilotAdapter } from './copilot/index.js'
import { cursorAdapter } from './cursor/index.js'
import { grokAdapter } from './grok/index.js'
import { opencodeAdapter } from './opencode/index.js'
import { stdoutAdapter } from './stdout/index.js'
import type { AgentAdapter } from './types.js'

const adapters: Record<LogAdapter, AgentAdapter> = { claude: claudeAdapter, codex: codexAdapter, cursor: cursorAdapter, grok: grokAdapter, copilot: copilotAdapter, agy: agyAdapter, opencode: opencodeAdapter, stdout: stdoutAdapter }
export function adapterFor(id: LogAdapter): AgentAdapter { return adapters[id] }
