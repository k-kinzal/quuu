import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  statSync
} from 'node:fs'
import { basename, dirname, join } from 'node:path'
import type { LogAdapter } from '../agents/cliAdapter.js'
import { claudeProjectsDir, codexSessionsDir, copilotSessionsDir, cursorChatsDir, grokSessionsDir } from '../appPaths.js'
import { readCopilotWorkspace } from '../session/copilotPaths.js'
import { readCursorChat } from '../session/cursorStore.js'
import { lastWrittenMs } from '../session/logAdapters.js'
import { collectText, extractUserQuery } from '../session/parserUtil.js'

/**
 * Find sessions started directly from an AI CLI and read the minimum needed to import them.
 *
 * We do not parse the whole log. Import only needs four things —
 * "in which directory, when, and what did the session do" —
 * and the existing parsers read the contents when the conversation view opens.
 */

export interface ExternalSession {
  adapter: LogAdapter
  /** Unique key `<adapter>:<sessionId>`. Used for import idempotency. */
  key: string
  sessionId: string
  cwd: string
  title: string | null
  logPath: string
  startedAt: string
  /** Last update. Used to decide whether it is running, and as a stand-in for the finish time. */
  updatedAt: string
  /** CLI command used (for display). */
  command: string
  /**
   * What started this session (Claude Code's `entrypoint` / Codex's `originator`).
   * null for old logs without the marker. `startedByProgram` owns the decision.
   */
  entrypoint: string | null
}

/**
 * Was this session started by a program (= a subagent)?
 *
 * Separates what a human typed from what another agent, skill, or script started.
 * Observed values split like this:
 *
 *   human    claude `cli` / codex `codex-tui` `codex_cli_rs` `Codex Desktop` / cursor `cli`
 *   machine  claude `sdk-cli` / codex `codex_exec` `codex_sdk_ts` / cursor subagents
 *
 * claude and codex use distinct words for "via SDK" and "non-interactive run", so we look
 * for those two words. Cursor carries no origin marker, so we detect the injected preamble
 * and synthesize `cursor-subagent` instead (readCursorSession in adapters.ts).
 *
 * Anything without a marker is treated as human (dropping the undecidable ones
 * would tip toward old history silently disappearing).
 */
export function startedByProgram(entrypoint: string | null): boolean {
  if (entrypoint === null) return false
  const v = entrypoint.toLowerCase()
  return v.includes('sdk') || v.includes('exec') || v.includes('subagent')
}

const HEAD_BYTES = 64 * 1024
/**
 * Codex puts the full system prompt in session_meta and AGENTS.md in the following
 * developer message, so the first human-written utterance can land past 64KB.
 * Read deeper only when it was not found.
 */
const DEEP_BYTES = 768 * 1024

function readHead(path: string, bytes = HEAD_BYTES): string {
  const fd = openSync(path, 'r')
  try {
    const size = statSync(path).size
    const length = Math.min(bytes, size)
    const buf = Buffer.allocUnsafe(length)
    const read = readSync(fd, buf, 0, length, 0)
    return buf.subarray(0, read).toString('utf8')
  } finally {
    closeSync(fd)
  }
}

function walk(dir: string, out: string[], depth = 0): void {
  if (depth > 6) return
  let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>
  try {
    entries = readdirSync(dir, { withFileTypes: true, encoding: 'utf8' })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out, depth + 1)
    else if (entry.isFile() && entry.name.endsWith('.jsonl')) out.push(full)
  }
}

// ---------------------------------------------------------------------------
// Claude Code
// ---------------------------------------------------------------------------

function readClaudeSession(path: string): ExternalSession | null {
  const head = readHead(path)
  const lines = head.split('\n')

  let cwd = ''
  let sessionId = ''
  let startedAt = ''
  let title: string | null = null
  let entrypoint: string | null = null

  for (const line of lines) {
    if (line.trim().length === 0) continue
    let entry: Record<string, unknown>
    try {
      entry = JSON.parse(line) as Record<string, unknown>
    } catch {
      continue
    }
    if (typeof entry.cwd === 'string' && !cwd) cwd = entry.cwd
    if (typeof entry.sessionId === 'string' && !sessionId) sessionId = entry.sessionId
    if (typeof entry.timestamp === 'string' && !startedAt) startedAt = entry.timestamp
    // The origin marker rides on the same line as cwd, but some versions lack it, so pick it up independently
    if (typeof entry.entrypoint === 'string' && !entrypoint) entrypoint = entry.entrypoint
    if (entry.type === 'ai-title' && typeof entry.aiTitle === 'string') title = entry.aiTitle
    if (!title && entry.type === 'user') {
      const message = entry.message as { content?: unknown } | undefined
      if (typeof message?.content === 'string') title = firstLine(message.content)
    }
    if (cwd && sessionId && startedAt && title && entrypoint) break
  }

  if (!cwd || !sessionId) return null

  const stat = statSync(path)
  return {
    adapter: 'claude',
    key: `claude:${sessionId}`,
    sessionId,
    cwd,
    title,
    logPath: path,
    startedAt: startedAt || stat.birthtime.toISOString(),
    updatedAt: stat.mtime.toISOString(),
    command: 'claude',
    entrypoint
  }
}

// ---------------------------------------------------------------------------
// Codex
// ---------------------------------------------------------------------------

function readCodexSession(path: string, bytes = HEAD_BYTES): ExternalSession | null {
  const head = readHead(path, bytes)
  const lines = head.split('\n')

  let cwd = ''
  let sessionId = ''
  let startedAt = ''
  let title: string | null = null
  let originator: string | null = null

  for (const line of lines) {
    if (line.trim().length === 0) continue
    let entry: Record<string, unknown>
    try {
      entry = JSON.parse(line) as Record<string, unknown>
    } catch {
      continue
    }
    const payload = entry.payload as Record<string, unknown> | undefined

    if (entry.type === 'session_meta' && payload) {
      if (typeof payload.cwd === 'string') cwd = payload.cwd
      if (typeof payload.session_id === 'string') sessionId = payload.session_id
      if (typeof payload.timestamp === 'string') startedAt = payload.timestamp
      // Origin. `codex exec` (program-started) and interactive sessions split here
      if (typeof payload.originator === 'string') originator = payload.originator
    }

    // Use the first human-written message as the title.
    // The developer role is preamble (AGENTS.md etc.), so skip it.
    if (!title && entry.type === 'response_item' && payload?.type === 'message') {
      if (payload.role === 'user') {
        const content = payload.content
        if (Array.isArray(content)) {
          const text = content
            .map((c) => (c && typeof c === 'object' ? String((c as { text?: string }).text ?? '') : ''))
            .join('')
          const candidate = firstLine(text)
          if (candidate && !candidate.startsWith('# AGENTS.md')) title = candidate
        }
      }
    }
    if (cwd && sessionId && startedAt && title) break
  }

  if (!cwd || !sessionId) return null

  // Re-read one level deeper only when no title was found
  if (!title && bytes < DEEP_BYTES && statSync(path).size > bytes) {
    const deeper = readCodexSession(path, DEEP_BYTES)
    if (deeper?.title) return deeper
  }

  const stat = statSync(path)
  return {
    adapter: 'codex',
    key: `codex:${sessionId}`,
    sessionId,
    cwd,
    title,
    logPath: path,
    startedAt: startedAt || stat.birthtime.toISOString(),
    updatedAt: stat.mtime.toISOString(),
    command: 'codex',
    entrypoint: originator
  }
}

// ---------------------------------------------------------------------------
// Cursor
// ---------------------------------------------------------------------------

/**
 * How many messages to read for the title and provenance.
 *
 * A single Cursor conversation can be tens of MB. Import only needs
 * "who, where, and what was asked", so read the head and stop.
 * A few preamble messages (system prompt, environment info) come first, so leave room for them.
 */
const CURSOR_HEAD_MESSAGES = 8

function readCursorSession(storePath: string): ExternalSession | null {
  const chatId = basename(dirname(storePath))
  const meta = readCursorMeta(dirname(storePath))
  const chat = readCursorChat(storePath, chatId, { maxMessages: CURSOR_HEAD_MESSAGES })
  if (!chat) return null

  const cwd = meta?.cwd ?? chat.workspacePath
  if (!cwd) return null

  const stat = statSync(storePath)
  const createdMs = meta?.createdAtMs ?? null
  /*
   * For the last-active time, take the newer of meta.json and the file timestamps.
   *
   * meta.json's updatedAtMs is written at the start of a turn and is not updated
   * by writes to store.db after that (we observed a chat off by 7 minutes).
   * Using it alone as the last update would drop the session to "done" that much earlier.
   */
  const updatedMs = newest([meta?.updatedAtMs ?? null, lastWrittenMs('cursor', storePath)])

  return {
    adapter: 'cursor',
    key: `cursor:${chatId}`,
    sessionId: chatId,
    cwd,
    title: cursorTitle(chat.messages) ?? placeholderName(chat.name),
    logPath: storePath,
    startedAt: (createdMs === null ? stat.birthtime : new Date(createdMs)).toISOString(),
    updatedAt: (updatedMs === null ? stat.mtime : new Date(updatedMs)).toISOString(),
    command: 'cursor-agent',
    /*
     * Only chats started from the CLI carry the `cli` marker (ones created in the IDE do not).
     * Subagents have no marker; instead a preamble saying they run under a parent agent
     * is injected, so we tell them apart by that.
     */
    entrypoint: isCursorSubagent(chat.messages) ? 'cursor-subagent' : chat.entrypoint
  }
}

interface CursorMeta {
  cwd: string | null
  createdAtMs: number | null
  updatedAtMs: number | null
}

/** `<chatId>/meta.json`. The cheapest place to read cwd and the timestamps. */
function readCursorMeta(dir: string): CursorMeta | null {
  let text: string
  try {
    text = readFileSync(join(dir, 'meta.json'), 'utf8')
  } catch {
    return null
  }
  try {
    const json = JSON.parse(text) as {
      cwd?: unknown
      createdAtMs?: unknown
      updatedAtMs?: unknown
    }
    return {
      cwd: typeof json.cwd === 'string' ? json.cwd : null,
      createdAtMs: typeof json.createdAtMs === 'number' ? json.createdAtMs : null,
      updatedAtMs: typeof json.updatedAtMs === 'number' ? json.updatedAtMs : null
    }
  } catch {
    return null
  }
}

function cursorTitle(messages: Array<{ role: string; content: unknown }>): string | null {
  for (const message of messages) {
    if (message.role !== 'user') continue
    const text = collectText(message.content)
    const body = extractUserQuery(text)
    // Messages without `<user_query>` are preamble such as environment info
    if (body === text.trim()) continue
    const line = firstLine(body)
    if (line) return line
  }
  return null
}

/** Preamble injected into subagents (observed). */
function isCursorSubagent(messages: Array<{ role: string; content: unknown }>): boolean {
  return messages.some(
    (m) => m.role === 'user' && collectText(m.content).includes('running as a subagent')
  )
}

/** Newest of the candidate times. null when none is readable. */
function newest(candidates: Array<number | null>): number | null {
  let out: number | null = null
  for (const value of candidates) {
    if (value === null) continue
    if (out === null || value > out) out = value
  }
  return out
}

/** Default names like `New Agent` are meaningless as titles. */
function placeholderName(name: string | null): string | null {
  if (!name || name === 'New Agent') return null
  return name
}

// ---------------------------------------------------------------------------
// Grok
// ---------------------------------------------------------------------------

function readGrokSession(historyPath: string): ExternalSession | null {
  const dir = dirname(historyPath)
  const sessionId = basename(dir)
  const summary = readGrokSummary(dir)

  // summary.json holds the cwd. Without it, recover from the directory name (percent-encoded cwd).
  const cwd = summary?.cwd ?? decodeDirName(basename(dirname(dir)))
  if (!cwd) return null

  const stat = statSync(historyPath)
  return {
    adapter: 'grok',
    key: `grok:${sessionId}`,
    sessionId,
    cwd,
    title: summary?.title ?? readGrokTitle(historyPath),
    logPath: historyPath,
    startedAt: summary?.createdAt ?? stat.birthtime.toISOString(),
    updatedAt: summary?.updatedAt ?? stat.mtime.toISOString(),
    command: 'grok',
    // No origin marker is written (observed). Treat as typed by a human.
    entrypoint: null
  }
}

interface GrokSummary {
  cwd: string | null
  title: string | null
  createdAt: string | null
  updatedAt: string | null
}

function readGrokSummary(dir: string): GrokSummary | null {
  let text: string
  try {
    text = readFileSync(join(dir, 'summary.json'), 'utf8')
  } catch {
    return null
  }
  try {
    const json = JSON.parse(text) as {
      info?: { cwd?: unknown }
      created_at?: unknown
      updated_at?: unknown
      generated_title?: unknown
    }
    const title = json.generated_title
    return {
      cwd: typeof json.info?.cwd === 'string' ? json.info.cwd : null,
      title: typeof title === 'string' && title.length > 0 ? title : null,
      createdAt: typeof json.created_at === 'string' ? json.created_at : null,
      updatedAt: typeof json.updated_at === 'string' ? json.updated_at : null
    }
  } catch {
    return null
  }
}

/** The first human-typed prompt. Lines carrying `prompt_index` are the ones. */
function readGrokTitle(historyPath: string): string | null {
  const head = readHead(historyPath, DEEP_BYTES)
  for (const line of head.split('\n')) {
    if (line.trim().length === 0) continue
    let entry: { type?: string; content?: unknown; prompt_index?: unknown }
    try {
      entry = JSON.parse(line) as typeof entry
    } catch {
      continue
    }
    if (entry.type !== 'user' || typeof entry.prompt_index !== 'number') continue
    const line1 = firstLine(extractUserQuery(collectText(entry.content)))
    if (line1) return line1
  }
  return null
}

// ---------------------------------------------------------------------------
// GitHub Copilot
// ---------------------------------------------------------------------------

function readCopilotSession(eventsPath: string): ExternalSession | null {
  const sessionId = basename(dirname(eventsPath))
  const workspace = readCopilotWorkspace(sessionId)
  const fromEvents = workspace ? null : readCopilotStart(eventsPath)

  const cwd = workspace?.cwd ?? fromEvents?.cwd
  if (!cwd) return null

  const stat = statSync(eventsPath)
  return {
    adapter: 'copilot',
    key: `copilot:${sessionId}`,
    sessionId,
    cwd,
    title: workspace?.title ?? readCopilotTitle(eventsPath),
    logPath: eventsPath,
    startedAt: workspace?.createdAt ?? fromEvents?.startedAt ?? stat.birthtime.toISOString(),
    updatedAt: workspace?.updatedAt ?? stat.mtime.toISOString(),
    command: 'copilot',
    // No origin marker is written (observed). Treat as typed by a human.
    entrypoint: null
  }
}

function readCopilotStart(eventsPath: string): { cwd: string; startedAt: string } | null {
  for (const line of readHead(eventsPath).split('\n')) {
    if (line.trim().length === 0) continue
    let entry: { type?: string; data?: { context?: { cwd?: unknown }; startTime?: unknown } }
    try {
      entry = JSON.parse(line) as typeof entry
    } catch {
      continue
    }
    if (entry.type !== 'session.start') continue
    const cwd = entry.data?.context?.cwd
    if (typeof cwd !== 'string') continue
    const startTime = entry.data?.startTime
    return { cwd, startedAt: typeof startTime === 'string' ? startTime : '' }
  }
  return null
}

function readCopilotTitle(eventsPath: string): string | null {
  for (const line of readHead(eventsPath, DEEP_BYTES).split('\n')) {
    if (line.trim().length === 0) continue
    let entry: { type?: string; data?: { content?: unknown } }
    try {
      entry = JSON.parse(line) as typeof entry
    } catch {
      continue
    }
    if (entry.type !== 'user.message') continue
    // Copilot keeps the raw body (the preamble lives in transformedContent)
    const line1 = firstLine(collectText(entry.data?.content))
    if (line1) return line1
  }
  return null
}

// ---------------------------------------------------------------------------

interface Discovered {
  path: string
  mtimeMs: number
  adapter: LogAdapter
}

/**
 * Enumerate sessions from every adapter.
 * Sort newest first; drop anything older than `since` and anything past `limit`.
 */
export function discoverSessions(options: {
  since: Date | null
  limit: number
}): ExternalSession[] {
  const files: Discovered[] = []

  const add = (path: string, adapter: LogAdapter): void => {
    try {
      const stat = statSync(path)
      if (stat.size === 0) return
      // The main file's mtime is not necessarily the last write (Cursor's WAL). logAdapters owns the decision
      const mtimeMs = lastWrittenMs(adapter, path) ?? stat.mtimeMs
      if (options.since && mtimeMs < options.since.getTime()) return
      files.push({ path, mtimeMs, adapter })
    } catch {
      // Skip anything unreadable
    }
  }

  /** Layouts with no fixed depth (claude / codex) get walked to collect .jsonl files. */
  const collectByWalk = (dir: string, adapter: LogAdapter): void => {
    if (!existsSync(dir)) return
    const found: string[] = []
    walk(dir, found)
    for (const path of found) add(path, adapter)
  }

  /**
   * Layouts with a fixed depth get only that level inspected.
   * Walking would waste 8 stats per session (locks and in-progress state).
   */
  const collectAtDepth = (dir: string, depth: number, leaf: string, adapter: LogAdapter): void => {
    for (const sessionDir of dirsAtDepth(dir, depth)) add(join(sessionDir, leaf), adapter)
  }

  collectByWalk(claudeProjectsDir(), 'claude')
  collectByWalk(codexSessionsDir(), 'codex')
  // <root>/<percent-encoded cwd>/<sessionId>/chat_history.jsonl
  collectAtDepth(grokSessionsDir(), 2, 'chat_history.jsonl', 'grok')
  // <root>/<sessionId>/events.jsonl
  collectAtDepth(copilotSessionsDir(), 1, 'events.jsonl', 'copilot')
  // <root>/<md5(cwd)>/<chatId>/store.db
  collectAtDepth(cursorChatsDir(), 2, 'store.db', 'cursor')

  files.sort((a, b) => b.mtimeMs - a.mtimeMs)

  const sessions: ExternalSession[] = []
  for (const file of files) {
    if (sessions.length >= options.limit) break
    try {
      const session = readSession(file)
      if (session) sessions.push(session)
    } catch {
      // Skip broken logs
    }
  }
  return sessions
}

function readSession(file: Discovered): ExternalSession | null {
  switch (file.adapter) {
    case 'codex':
      return readCodexSession(file.path)
    case 'cursor':
      return readCursorSession(file.path)
    case 'grok':
      return readGrokSession(file.path)
    case 'copilot':
      return readCopilotSession(file.path)
    default:
      return readClaudeSession(file.path)
  }
}

/** Directories `depth` levels down from the root. */
function dirsAtDepth(root: string, depth: number): string[] {
  let current = [root]
  for (let i = 0; i < depth; i += 1) {
    const next: string[] = []
    for (const dir of current) {
      let entries: Array<{ name: string; isDirectory(): boolean }>
      try {
        entries = readdirSync(dir, { withFileTypes: true, encoding: 'utf8' })
      } catch {
        continue
      }
      for (const entry of entries) {
        if (entry.isDirectory()) next.push(join(dir, entry.name))
      }
    }
    current = next
  }
  return current
}

/**
 * Recover a percent-encoded cwd.
 * null when it cannot be recovered (a different naming scheme). Getting the cwd
 * wrong queues tasks onto an unrelated project.
 */
function decodeDirName(name: string): string | null {
  try {
    const decoded = decodeURIComponent(name)
    return decoded.startsWith('/') ? decoded : null
  } catch {
    return null
  }
}

function firstLine(text: string): string | null {
  const line = text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !l.startsWith('<'))
  if (!line) return null
  return line.length > 120 ? `${line.slice(0, 119)}…` : line
}
