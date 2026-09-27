import type { Db } from '../db/database.js'
import * as repo from '../db/repo.js'
import { SessionIndex, sessionKey } from './index.js'
import { sessionReadTarget } from './sessionAttach.js'

export interface HistoryQuery {
  runId: string
  offset?: number
  generation?: string
  limit?: number
  search?: string
}

/** Stateless, bounded pages let analysis walk history without creating a live window subscription. */
export class SessionHistory {
  constructor(private db: Db, private index: SessionIndex) {}

  async page(query: HistoryQuery) {
    const run = repo.getRun(this.db, query.runId)
    if (!run) throw new Error(`Run not found: ${query.runId}`)
    const target = sessionReadTarget(this.db, run)
    const key = sessionKey(target)
    this.index.request(run, target)
    await this.index.ready(key)
    const saved = repo.getSessionIndex(this.db, key)
    if (query.generation && saved?.generation !== query.generation) throw new Error('The session was reindexed; restart paging from offset 0')
    const offset = query.offset ?? 0
    const limit = Math.min(200, Math.max(1, query.limit ?? 80))
    const messages = saved ? repo.readSessionMessages(this.db, key, saved.generation, offset, limit) : []
    const next = offset + messages.length
    const search = query.search?.toLocaleLowerCase()
    return {
      runId: run.id, sessionId: target.sessionId, exists: Boolean(saved), generation: saved?.generation ?? '',
      messages: search ? messages.filter(message => JSON.stringify(message.blocks).toLocaleLowerCase().includes(search)) : messages,
      next: saved && next < saved.total ? next : null, total: saved?.total ?? 0,
    }
  }
}
