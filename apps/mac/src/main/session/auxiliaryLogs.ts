import { adapterFor } from '../agent-adapters/registry.js'
import { jsonLogMentions } from '../agent-adapters/discovery.js'
import { IMPORTABLE_ADAPTERS, type LogAdapter } from '../agents/cliAdapter.js'
import type { Db } from '../db/database.js'
import { SessionIndex, sessionKey } from './index.js'
import { resolveLogPath } from './logAdapters.js'
import type { SessionReadTarget } from './sessionAttach.js'
import type { SessionSnapshot } from './types.js'

export interface AuxiliaryPageInput {
  id: string
  before?: number
  after?: number
  generation?: string
}
export interface AuxiliaryPage extends SessionSnapshot {
  cwd: string
  input: string
  structured: boolean
}

export interface AuxiliarySource {
  logPath: string
  cwd: string
  startedAt: string
  endedAt?: string | null
  running: boolean
  adapter?: LogAdapter | null
  sessionId?: string
  input?: string
  /** null means a remote writer has not delivered its session yet. Never search local sessions. */
  mirroredPath?: string | null
}

/** The same bounded, durable conversation reader as task chat, with no selected-view side effects. */
export class AuxiliaryLogs {
  private index: SessionIndex
  constructor(db: Db) { this.index = new SessionIndex(db) }
  stop(): void { this.index.stop() }

  async page(source: AuxiliarySource, request: AuxiliaryPageInput): Promise<AuxiliaryPage> {
    const target = readTarget(source)
    this.index.requestAuxiliary(target, source.running)
    await this.index.ready(sessionKey(target))
    // Raw output groups 200 lines per message; keep its pages smaller than conversation pages.
    const count = target.mode === 'stdout' ? 8 : 80
    const latest = this.index.page(target, undefined, count)
    const sameGeneration = !request.generation || request.generation === latest.generation
    const end = sameGeneration ? request.before ?? (request.after === undefined ? undefined : request.after + count) : undefined
    const page = end === undefined ? latest : this.index.page(target, end, count)
    return { ...page, cwd: source.cwd, input: source.input ?? '', structured: target.mode !== 'stdout' }
  }

  image(source: AuxiliarySource, id: string): string | null {
    return this.index.image(readTarget(source), id)
  }
}

function readTarget(source: AuxiliarySource): SessionReadTarget {
  let adapter = source.adapter
  let sessionId = source.sessionId ?? ''
  let path: string | null = null
  if (source.mirroredPath !== undefined) path = source.mirroredPath
  else if (adapter && adapter !== 'stdout') {
    const provider = adapterFor(adapter)
    sessionId = provider.sessionIdInStdout?.(source.logPath) ?? sessionId
    path = sessionId ? resolveLogPath(adapter, source.cwd, sessionId) : null
    // Some templates omit the supplied ID. Match the actual instruction as well as launch time.
    if (!path && source.input) {
      const head = [...source.input].slice(0, 200).join('').trim()
      const start = Date.parse(source.startedAt)
      const end = source.endedAt ? Date.parse(source.endedAt) : Infinity
      const match = (provider.sessionCandidates?.(source.cwd) ?? [])
        .filter(candidate => candidate.bornMs >= start && candidate.bornMs <= end)
        .sort((a, b) => a.bornMs - b.bornMs)
        .find(candidate => (provider.logMentions ?? jsonLogMentions)(candidate, head))
      if (match) { path = match.logPath; sessionId = match.sessionId }
    }
  } else if (!adapter) {
    // Reports made before conversation metadata was kept can still identify themselves in stdout.
    for (const candidate of IMPORTABLE_ADAPTERS) {
      const id = adapterFor(candidate).sessionIdInStdout?.(source.logPath)
      const found = id ? resolveLogPath(candidate, source.cwd, id) : null
      if (id && found) { adapter = candidate; sessionId = id; path = found; break }
    }
  }
  return { sessionId, logPath: path ?? source.logPath, mode: path ? adapter ?? 'stdout' : 'stdout', awaitingStructured: !path && adapter !== 'stdout' }
}
