import { adapterFor } from '../agent-adapters/registry.js'
import { isStoreParser } from '../agent-adapters/types.js'
import type { LogAdapter } from '../agents/cliAdapter.js'
import { readLogTail } from '../platform/runProcess.js'
import { resolveLogPath } from './logAdapters.js'
import type { SessionMessage } from './types.js'

/** A bounded conversation preview for auxiliary processes, without changing the selected task session. */
export function auxiliaryMessages(adapter: LogAdapter | null, cwd: string, sessionId: string, stdout: string, mirroredPath?: string | null): SessionMessage[] {
  if (!adapter || adapter === 'stdout') return []
  const parser = adapterFor(adapter).createParser()
  // Store-backed providers cannot be tailed; their full stdout remains available in the log.
  if (isStoreParser(parser)) return []
  const path = mirroredPath === undefined ? resolveLogPath(adapter, cwd, sessionId) : mirroredPath
  parser.pushLines((path ? readLogTail(path) : stdout).split('\n'))
  // Images belong to a caller-owned session view. The auxiliary preview contains text and tools.
  return parser.messages.slice(-100).map(message => ({ ...message,
    blocks: message.blocks.filter(block => block.kind !== 'image').map(block =>
      block.kind === 'tool' ? { ...block, tool: { ...block.tool, images: [] } } : block)
  }))
}
