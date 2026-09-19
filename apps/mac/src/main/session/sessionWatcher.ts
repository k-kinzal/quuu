import { EventEmitter } from 'node:events'
import type { FSWatcher } from 'node:fs'
import { closeSync, existsSync, mkdirSync, openSync, readSync, statSync, watch } from 'node:fs'
import { dirname } from 'node:path'
import type { LogAdapter } from '../agents/cliAdapter.js'
import { AgySessionParser } from './agyParser.js'
import { ClaudeSessionParser } from './claudeParser.js'
import { CodexSessionParser } from './codexParser.js'
import { CopilotSessionParser } from './copilotParser.js'
import { CursorSessionParser } from './cursorParser.js'
import { GrokSessionParser } from './grokParser.js'
import { readsWholeStore } from './logAdapters.js'
import { OpencodeSessionParser } from './opencodeParser.js'
import { StdoutSessionParser } from './stdoutParser.js'
import type { MessageBuffer } from './messageBuffer.js'
import type { SessionMessage, SessionSnapshot } from './types.js'

const INITIAL_WINDOW = 400
const PAGE = 200
const DEBOUNCE_MS = 200
/**
 * The backstop for fs.watch.
 *
 * macOS's fs.watch drops and delays events, and relying on it quietly breaks the promise that
 * a running session follows along by itself.
 * Low latency is left to fs.watch; certainty is guaranteed by this polling.
 */
const POLL_MS = 1000

export interface AppendedEvent {
  /** Which run's conversation. The session ID can be swapped mid-flight, so matching happens on this. */
  runId: string
  sessionId: string
  messages: SessionMessage[]
  replaceFromId: string | null
  /** When the read target itself changed, replace the whole provisional log. */
  replacement?: Omit<SessionSnapshot, 'messages' | 'sessionId'>
}

interface OpenTarget {
  runId: string
  sessionId: string
  logPath: string
  /** How to read the log. 'stdout' shows the raw log as-is. */
  mode: LogAdapter
  /** Keep looking for a better read target even while the current log exists. */
  resolveWhilePresent?: boolean
  /**
   * The recovery for when the log cannot be found: go looking for the real one.
   *
   * If the CLI did not use the session ID Quuu minted, the file at this path never appears no
   * matter how long you wait. So the watch target is swapped the moment the real one is found,
   * and the conversation shows up even while you sit there watching the run.
   */
  resolve?: () => { sessionId: string; logPath: string; mode?: LogAdapter } | null
}

type Parser =
  | AgySessionParser
  | ClaudeSessionParser
  | CodexSessionParser
  | CopilotSessionParser
  | CursorSessionParser
  | GrokSessionParser
  | OpencodeSessionParser
  | StdoutSessionParser

/**
 * Parsers that answer with the whole conversation instead of with what was appended.
 *
 * Their content lives in SQLite and is rewritten in place, so they are re-read rather than
 * followed (`logAdapters.ts`). Everything that reads a session has to take this fork, so the
 * question is asked in one place rather than by naming Cursor at four call sites.
 */
export type StoreParser = CursorSessionParser | OpencodeSessionParser

export function isStoreParser(parser: Parser): parser is StoreParser {
  return parser instanceof CursorSessionParser || parser instanceof OpencodeSessionParser
}

export function newParser(mode: LogAdapter, imageNamespace?: string, buffer?: MessageBuffer): Parser {
  switch (mode) {
    case 'stdout':
      return new StdoutSessionParser(buffer)
    case 'codex':
      return new CodexSessionParser(buffer)
    case 'cursor':
      return new CursorSessionParser()
    case 'grok':
      return new GrokSessionParser(buffer)
    case 'copilot':
      return new CopilotSessionParser(buffer)
    case 'agy':
      return new AgySessionParser(buffer)
    case 'opencode':
      return new OpencodeSessionParser()
    default:
      return new ClaudeSessionParser(imageNamespace, buffer)
  }
}

/**
 * Is this a layout that gets replaced wholesale rather than appended to?
 *
 * Cursor keeps content in SQLite in a content-addressed form and opencode keeps every session in
 * one SQLite store, so in both the contents are swapped out every turn. Following along by byte
 * offset does not hold up. Which layouts these are is owned by `logAdapters.ts`.
 */
function isSnapshotMode(mode: LogAdapter): boolean {
  return readsWholeStore(mode)
}

/**
 * Incremental reading and watching of a session log.
 *
 * Only one session is watched at a time: the one currently on screen.
 * While it runs, appended content is pushed on a 200ms debounce.
 */
export class SessionWatcher extends EventEmitter {
  private target: OpenTarget | null = null
  private parser: Parser = new ClaudeSessionParser()
  private stdoutBuffer = ''
  /** For the wholesale-replacement layout (Cursor), the mark that remembers the state at the last read. */
  private snapshotStamp = ''
  private offset = 0
  private partial = ''
  private fileWatcher: FSWatcher | null = null
  private dirWatcher: FSWatcher | null = null
  private debounce: NodeJS.Timeout | null = null
  private poll: NodeJS.Timeout | null = null
  private windowSize = INITIAL_WINDOW

  /** Open a session, parse the whole thing, and return the trailing window. */
  open(target: OpenTarget): SessionSnapshot {
    this.close()
    this.target = target
    this.parser = newParser(target.mode)
    this.stdoutBuffer = ''
    this.snapshotStamp = ''
    this.offset = 0
    this.partial = ''
    this.windowSize = INITIAL_WINDOW

    const exists = existsSync(target.logPath)
    if (exists) this.readIncrement()
    this.startWatching()

    // Always catch up, even after a dropped event
    this.poll = setInterval(() => this.tick(), POLL_MS)
    this.poll.unref?.()

    return this.snapshot(exists)
  }

  /** Widen the window and return it with older messages included. */
  loadMore(): SessionSnapshot {
    this.windowSize += PAGE
    return this.snapshot(this.target ? existsSync(this.target.logPath) : false)
  }

  /**
   * The actual image (a data URL) shown in a conversation. Fetched only when it is displayed.
   * null when not found (past the retention cap, or the session was switched).
   */
  image(id: string): string | null {
    return this.parser instanceof ClaudeSessionParser ? this.parser.images.get(id) : null
  }

  close(): void {
    if (this.debounce) {
      clearTimeout(this.debounce)
      this.debounce = null
    }
    if (this.poll) {
      clearInterval(this.poll)
      this.poll = null
    }
    this.stopWatchers()
    this.target = null
  }

  get openSessionId(): string | null {
    return this.target?.sessionId ?? null
  }

  /** For tests. Stops fs.watch to confirm polling alone keeps up. */
  stopFileWatchersForTest(): void {
    this.stopWatchers()
  }

  private stopWatchers(): void {
    this.fileWatcher?.close()
    this.fileWatcher = null
    this.dirWatcher?.close()
    this.dirWatcher = null
  }

  // -------------------------------------------------------------------------

  private allMessages(): SessionMessage[] {
    if (!this.target) return []
    if (this.target.mode === 'stdout') return stdoutToMessages(this.stdoutBuffer)
    return this.parser.messages
  }

  /**
   * Re-read for the wholesale-replacement layout (Cursor).
   *
   * Nothing is read when nothing changed. Reopening SQLite every second means reading several MB
   * on a long conversation.
   */
  private reloadSnapshot(logPath: string): number {
    if (!isStoreParser(this.parser)) return -1
    const stamp = snapshotStamp(logPath)
    if (stamp === this.snapshotStamp) return -1
    this.snapshotStamp = stamp
    return this.parser.reload(logPath, this.target?.sessionId ?? '').changedFromIndex
  }

  private snapshot(exists: boolean): SessionSnapshot {
    const all = this.allMessages()
    const start = Math.max(0, all.length - this.windowSize)
    return {
      sessionId: this.target?.sessionId ?? '',
      logPath: this.target?.logPath ?? null,
      exists,
      title: this.parser.title,
      messages: all.slice(start),
      hasMore: start > 0,
      totalMessages: all.length
    }
  }

  private startWatching(): void {
    if (!this.target) return
    const { logPath } = this.target
    const dir = dirname(logPath)

    try {
      mkdirSync(dir, { recursive: true })
    } catch {
      // Only means we cannot watch; not fatal
    }

    const schedule = (): void => {
      if (this.debounce) clearTimeout(this.debounce)
      this.debounce = setTimeout(() => {
        this.debounce = null
        this.emitIncrement()
      }, DEBOUNCE_MS)
    }

    if (existsSync(logPath)) {
      try {
        this.fileWatcher = watch(logPath, schedule)
      } catch {
        this.fileWatcher = null
      }
    }

    // Watch the directory too, in case the file does not exist yet or gets recreated by a rename
    try {
      this.dirWatcher = watch(dir, (_evt, name) => {
        if (name && !logPath.endsWith(name)) return
        if (!this.fileWatcher && existsSync(logPath)) {
          try {
            this.fileWatcher = watch(logPath, schedule)
          } catch {
            this.fileWatcher = null
          }
        }
        schedule()
      })
    } catch {
      this.dirWatcher = null
    }
  }

  /** One polling round. Check the watch target is right first, then read what was appended. */
  private tick(): void {
    if (this.retarget()) return
    this.emitIncrement()
  }

  /**
   * While there is no log, or while showing a provisional one, look for the real thing and swap
   * the watch target and read mode once it is found.
   *
   * Returns whether it swapped. When it did, the re-read is already done.
   */
  private retarget(): boolean {
    const target = this.target
    if (!target?.resolve) return false
    if (existsSync(target.logPath) && !target.resolveWhilePresent) return false

    const found = target.resolve()
    if (!found) return false
    const mode = found.mode ?? target.mode
    if (
      found.logPath === target.logPath &&
      found.sessionId === target.sessionId &&
      mode === target.mode
    ) {
      return false
    }

    this.target = {
      ...target,
      sessionId: found.sessionId,
      logPath: found.logPath,
      mode,
      resolveWhilePresent: false
    }
    this.parser = newParser(mode)
    this.stdoutBuffer = ''
    this.snapshotStamp = ''
    this.offset = 0
    this.partial = ''
    this.stopWatchers()
    this.startWatching()
    this.readIncrement()
    const { messages, sessionId, ...replacement } = this.snapshot(existsSync(found.logPath))
    const event: AppendedEvent = { runId: target.runId, sessionId, messages, replaceFromId: null, replacement }
    this.emit('appended', event)
    return true
  }

  private emitIncrement(): void {
    if (!this.target) return
    const before = this.allMessages().length
    const changedFrom = this.readIncrement()
    if (changedFrom < 0) return

    const all = this.allMessages()
    if (all.length === before && changedFrom >= before) return

    const from = Math.max(0, changedFrom)
    const messages = all.slice(from)
    if (messages.length === 0) return

    const replaceFromId = from < before ? messages[0].id : null
    const event: AppendedEvent = {
      runId: this.target.runId,
      sessionId: this.target.sessionId,
      messages,
      replaceFromId
    }
    this.emit('appended', event)
  }

  /** Read and parse what was appended. Returns the index where the change starts (-1 for no change). */
  private readIncrement(): number {
    if (!this.target) return -1
    const { logPath, mode } = this.target

    if (isSnapshotMode(mode)) return this.reloadSnapshot(logPath)

    let size: number
    try {
      size = statSync(logPath).size
    } catch {
      return -1
    }

    if (size < this.offset) {
      // Truncated / replaced. Read from the top again.
      this.offset = 0
      this.partial = ''
      if (mode === 'stdout') this.stdoutBuffer = ''
      else this.parser = newParser(mode)
    }
    if (size === this.offset) return -1

    const chunk = readRange(logPath, this.offset, size)
    this.offset = size
    if (chunk.length === 0) return -1

    if (mode === 'stdout') {
      const before = stdoutToMessages(this.stdoutBuffer).length
      this.stdoutBuffer += chunk
      const after = stdoutToMessages(this.stdoutBuffer).length
      return after === before ? Math.max(0, before - 1) : Math.max(0, before - 1)
    }

    // A replacement-style parser never gets here (isSnapshotMode returned earlier)
    if (isStoreParser(this.parser)) return -1

    const text = this.partial + chunk
    const lines = text.split('\n')
    this.partial = lines.pop() ?? ''
    if (lines.length === 0) return -1
    return this.parser.pushLines(lines).changedFromIndex
  }
}

/**
 * The mark used to catch SQLite changes.
 *
 * Under WAL, appends land on the `-wal` side and neither the main file's size nor its mtime moves.
 * Watching the main file alone gives "it is running but the conversation never grows", so watch both.
 */
export function snapshotStamp(path: string): string {
  const parts: string[] = []
  for (const target of [path, `${path}-wal`]) {
    try {
      const st = statSync(target)
      parts.push(`${st.dev}:${st.ino}:${st.size}:${st.mtimeMs}:${st.ctimeMs}`)
    } catch {
      parts.push('-')
    }
  }
  return parts.join('|')
}

function readRange(path: string, start: number, end: number): string {
  const length = end - start
  if (length <= 0) return ''
  const fd = openSync(path, 'r')
  try {
    const buf = Buffer.allocUnsafe(length)
    const read = readSync(fd, buf, 0, length, start)
    return buf.subarray(0, read).toString('utf8')
  } finally {
    closeSync(fd)
  }
}

/**
 * For the stdout adapter. Turns the raw log into messages in chunks of 200 lines.
 * The bare minimum so "what happened" can be followed on CLIs other than Claude.
 */
export function stdoutToMessages(buffer: string): SessionMessage[] {
  if (buffer.length === 0) return []
  // Quuu's launch header is not conversation. Do not show the command, prompt and all, twice.
  // It stays in the raw file, so it can be read from the run log when diagnosing.
  const output = buffer.replace(/^# Quuu run [^\n]+\n# [^\n]+\n# cwd: [^\n]+\n# cmd: [^\n]+\n\n/, '')
  const lines = output.split('\n')
  const chunks: SessionMessage[] = []
  const CHUNK = 200
  for (let i = 0; i < lines.length; i += CHUNK) {
    const slice = lines.slice(i, i + CHUNK).join('\n')
    if (slice.trim().length === 0) continue
    chunks.push({
      id: `stdout_${i}`,
      role: 'system',
      isSidechain: false,
      timestamp: null,
      blocks: [{ kind: 'text', text: slice }],
      model: null
    })
  }
  return chunks
}
