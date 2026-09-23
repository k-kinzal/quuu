import {
  opencodeDbPath
} from '../../appPaths.js'
import { firstLine, type ExternalLogs, type ExternalSession } from '../external.js'
import { collectText } from '../parserUtil.js'
import { unquotePrompt } from './parser.js'
import { listOpencodeSessions, readOpencodeMessages, readOpencodeSession } from './store.js'

// ---------------------------------------------------------------------------
// opencode
// ---------------------------------------------------------------------------

/**
 * One session out of opencode's store.
 *
 * There is no file to read: the session is a row, and so is every message
 * (`session/opencodeStore.ts`). The "log path" recorded here is the store itself, which is what
 * the conversation view opens - it finds the session by id, not by path.
 */
function readOpencodeExternalSession(sessionId: string): ExternalSession | null {
  const session = readOpencodeSession(sessionId)
  if (!session) return null

  return {
    adapter: 'opencode',
    key: `opencode:${session.id}`,
    sessionId: session.id,
    cwd: session.directory,
    title: session.title ?? opencodeTitle(session.id),
    logPath: opencodeDbPath(),
    startedAt: new Date(session.createdMs).toISOString(),
    updatedAt: new Date(session.updatedMs).toISOString(),
    command: 'opencode',
    /*
     * There is no origin marker. A session with a parent is one an agent started for itself, and
     * that is exactly what `startedByProgram` is asked to keep out of the task list, so it is
     * spelled out here the same way Cursor's sub-agents are.
     */
    entrypoint: session.parentId ? 'opencode-subagent' : null
  }
}

/** The first thing the human asked. Only the head is read: a session can hold thousands of rows. */
function opencodeTitle(sessionId: string): string | null {
  const messages = readOpencodeMessages(sessionId, { maxMessages: OPENCODE_HEAD_MESSAGES })
  for (const message of messages ?? []) {
    if (message.type !== 'user') continue
    const text = unquotePrompt(collectText((message.data as { text?: unknown })?.text))
    const line = firstLine(text)
    if (line) return line
  }
  return null
}

/** Enough rows to reach the first human message past any preamble. */
const OPENCODE_HEAD_MESSAGES = 8
export const external: ExternalLogs = {
  files: options => listOpencodeSessions({ sinceMs: options.since?.getTime() ?? 0, limit: options.limit }).map(session => ({ path: opencodeDbPath(), mtimeMs: session.updatedMs, sessionId: session.id })),
  read: file => file.sessionId ? readOpencodeExternalSession(file.sessionId) : null
}
