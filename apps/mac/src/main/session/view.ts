import { EventEmitter } from 'node:events'
import type { Db } from '../db/database.js'
import * as repo from '../db/repo.js'
import { t } from '../i18n/index.js'
import { SessionIndex, SESSION_PAGE, SESSION_WINDOW, sessionKey } from './index.js'
import { sessionReadTarget, structuredSessionTarget, type SessionReadTarget } from './sessionAttach.js'
import type { AppendedEvent } from './sessionWatcher.js'
import type { SessionSnapshot } from './types.js'

/** A window owns selection and paging; the app owns ingestion and durable history. */
export class SessionView {
  readonly watcher = new EventEmitter()
  private runId: string | null = null
  private target: SessionReadTarget | null = null
  private current: SessionSnapshot | null = null
  private poll: NodeJS.Timeout | null = null
  private selection = 0
  private readonly index: SessionIndex
  private readonly ownsIndex: boolean
  constructor(private db: Db, index?: SessionIndex) {
    this.index = index ?? new SessionIndex(db)
    this.ownsIndex = !index
  }

  loadSession(runId: string): SessionSnapshot {
    this.selection++
    this.unsubscribe()
    this.target = null
    this.current = null
    const run = repo.getRun(this.db, runId)
    this.runId = run?.id ?? null
    if (!run) return { sessionId: '', logPath: null, exists: false, title: null, messages: [], hasMore: false, totalMessages: 0 }
    this.target = sessionReadTarget(this.db, run)
    this.current = this.index.openPage(this.target)
    this.index.on('indexed', this.updated)
    this.index.request(run, this.target, true)
    this.poll = setInterval(() => {
      const latest = this.runId ? repo.getRun(this.db, this.runId) : null
      if (!latest || !this.target) return
      const next = this.target.awaitingStructured || !this.current?.exists
        ? structuredSessionTarget(this.db, latest) : null
      if (next && sessionKey(next) !== sessionKey(this.target)) {
        this.target = next
        this.current = this.index.openPage(next)
        this.publish()
      }
      this.index.request(latest, this.target)
    }, 1000)
    this.poll.unref?.()
    return this.current
  }

  private updated = (key: string): void => {
    if (!this.target || sessionKey(this.target) !== key) return
    const previous = this.current
    const same = previous?.generation !== 'preview'
    this.current = this.index.page(this.target,
      same && previous?.hasNewer ? previous.last : undefined,
      Math.min(SESSION_WINDOW, Math.max(SESSION_PAGE, previous?.messages.length ?? 0)))
    this.publish()
  }

  private publish(): void {
    if (!this.current || !this.runId) return
    const { messages, sessionId, ...replacement } = this.current
    this.watcher.emit('appended', { runId: this.runId, sessionId, messages, replaceFromId: null, replacement } satisfies AppendedEvent)
  }

  async loadMoreSession(runId?: string, direction: 'older' | 'newer' | 'latest' = 'older'): Promise<SessionSnapshot> {
    const selection = this.selection
    if (runId !== undefined && this.runId !== runId) throw new Error(t('conversation.changed'))
    if (this.current?.indexing && this.target) await this.index.ready(sessionKey(this.target))
    if (!this.target || !this.current || selection !== this.selection || (runId !== undefined && this.runId !== runId)) throw new Error(t('conversation.changed'))
    const current = this.current
    const count = direction === 'latest' ? SESSION_PAGE : Math.min(SESSION_WINDOW, current.messages.length + SESSION_PAGE)
    const end = direction === 'older'
      ? Math.min(current.last ?? 0, Math.max(0, (current.first ?? 0) - SESSION_PAGE) + count)
      : direction === 'newer' ? (current.last ?? 0) + SESSION_PAGE : undefined
    this.current = this.index.page(this.target, end, count)
    return this.current
  }

  sessionImage(imageId: string): string | null { return this.target ? this.index.image(this.target, imageId) : null }

  private unsubscribe(): void {
    if (this.poll) clearInterval(this.poll)
    this.poll = null
    this.index.off('indexed', this.updated)
  }

  closeSession(): void {
    this.selection++
    this.unsubscribe()
    this.runId = null
    this.target = null
    this.current = null
    if (this.ownsIndex) this.index.stop()
    this.watcher.removeAllListeners()
  }
}
