import { adapterFor } from '../agent-adapters/registry.js'
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { closeSync, openSync, readSync, statSync } from 'node:fs'
import { StringDecoder } from 'node:string_decoder'
import { setImmediate as yieldToApp } from 'node:timers/promises'
import type { Db } from '../db/database.js'
import { inTransaction } from '../db/database.js'
import * as repo from '../db/repo.js'
import type { Run } from '../execution/types.js'
import { IMPORTABLE_ADAPTERS, type LogAdapter } from '../agents/cliAdapter.js'
import { DERIVATION_VERSION, type SessionBatch, type SessionDerivation } from './derive.js'
import { readsWholeStore, sharesOneStore } from './logAdapters.js'
import { IndexedMessages } from './messageBuffer.js'
import { sessionReadTarget, type SessionReadTarget } from './sessionAttach.js'
import { isStoreParser, newParser, snapshotStamp, stdoutToMessages } from './sessionWatcher.js'
import type { SessionMessage, SessionSnapshot } from './types.js'

export const SESSION_PAGE = 80
export const SESSION_WINDOW = 240
const CHUNK_BYTES = 64 * 1024
const PREVIEW_BYTES = 256 * 1024

interface Reader {
  parser: ReturnType<typeof newParser>
  buffer: IndexedMessages
  offset: number
  inode: number
  decoder: StringDecoder
  partial: string
  generation: string
}

export function sessionKey(target: SessionReadTarget): string {
  // Bump when a parser change requires rebuilding previously materialized messages.
  const version = adapterFor(target.mode).parserVersion
  const key = `${version}:${target.mode}:${target.logPath}`
  /*
   * Where one store holds every session (opencode) the path names no session at all, so the id
   * has to join the key. Two conversations sharing one key would materialize into each other's
   * pages - you would open one session and read another.
   */
  return sharesOneStore(target.mode) ? `${key}:${target.sessionId}` : key
}

/** Durable pages are the read path. Parsing is scheduled separately, even with every window closed. */
export class SessionIndex extends EventEmitter {
  private pending = new Map<string, { run: Run; target: SessionReadTarget }>()
  private readers = new Map<string, Reader>()
  private work: Promise<void> | null = null
  private stopped = false
  private activeKey: string | null = null
  /**
   * Tasks whose derivations have already been reset for re-reading.
   *
   * A task can hold more than one session (a follow-up that could not resume, a fallback to
   * another agent), and each is re-read on its own. Resetting per session would have the second
   * one wipe what the first just re-derived - the tab and the report line would disappear from
   * a task that really did produce them.
   */
  private rederived = new Set<string>()

  /**
   * @param derivations what is read off every page as it lands: review evidence, the working
   * directory. Applied inside the transaction that persists the page (`session/derive.ts`).
   */
  constructor(private db: Db, private derivations: SessionDerivation[] = []) { super() }

  /**
   * Drop pages materialized under a parser version no adapter reads any more.
   *
   * A key carries the parser version that wrote it, so a bumped parser leaves the old pages
   * behind, unread and taking up most of the database. Run once at startup, before the sweep
   * that re-reads the sessions under the current version.
   */
  sweepRetired(): number {
    const adapters: LogAdapter[] = [...IMPORTABLE_ADAPTERS, 'stdout']
    return repo.dropSessionIndexesOutside(this.db, adapters.map(id => `${adapterFor(id).parserVersion}:${id}:`))
  }

  request(run: Run, target = sessionReadTarget(this.db, run), priority = false): void {
    if (this.stopped) return
    const key = sessionKey(target)
    const stamp = snapshotStamp(target.logPath)
    const saved = repo.getSessionIndex(this.db, key)
    const rederive = saved && saved.evidenceVersion !== DERIVATION_VERSION
    if (stamp === '-|-' && !rederive) return
    if (saved?.stamp === stamp && !rederive) {
      if (run.status !== 'running') this.readers.delete(key)
      return
    }
    if (priority) this.pending = new Map([[key, { run, target }], ...[...this.pending].filter(([other]) => other !== key)])
    else this.pending.set(key, { run, target })
    if (!this.work) {
      // The first read must return before any history parsing begins.
      this.work = yieldToApp().then(() => this.drain()).finally(() => { this.work = null })
    }
  }

  async settled(): Promise<void> { await this.work }

  openPage(target: SessionReadTarget): SessionSnapshot {
    const saved = repo.getSessionIndex(this.db, sessionKey(target))
    const stamp = snapshotStamp(target.logPath)
    // After an app restart, show new output immediately while the durable index catches up.
    return saved && stamp !== '-|-' && saved.stamp !== stamp ? this.preview(target) : this.page(target)
  }

  async ready(key: string): Promise<void> {
    if (!this.pending.has(key) && this.activeKey !== key) return
    await new Promise<void>((resolve, reject) => {
      const cleanup = (): void => { this.off('indexed', done); this.off('failed', failed) }
      const done = (completed: string): void => { if (completed === key) { cleanup(); resolve() } }
      const failed = (completed: string, error: Error): void => { if (completed === key) { cleanup(); reject(error) } }
      this.on('indexed', done)
      this.on('failed', failed)
    })
  }

  stop(): void {
    this.stopped = true
    for (const key of new Set([...this.pending.keys(), ...(this.activeKey ? [this.activeKey] : [])])) {
      this.emit('failed', key, new Error('Session indexing stopped'))
    }
    this.pending.clear()
    this.readers.clear()
  }

  page(target: SessionReadTarget, end?: number, count = SESSION_PAGE): SessionSnapshot {
    const key = sessionKey(target)
    const saved = repo.getSessionIndex(this.db, key)
    if (!saved) return this.preview(target)
    const last = Math.min(saved.total, end ?? saved.total)
    const first = Math.max(0, last - count)
    return {
      sessionId: target.sessionId, logPath: target.logPath, exists: true, title: saved.title,
      messages: repo.readSessionMessages(this.db, key, saved.generation, first, last - first),
      totalMessages: saved.total, hasMore: first > 0, hasNewer: last < saved.total,
      first, last, generation: saved.generation, indexing: false
    }
  }

  image(target: SessionReadTarget, id: string): string | null {
    return repo.readSessionImage(this.db, sessionKey(target), id)
  }

  private preview(target: SessionReadTarget): SessionSnapshot {
    let messages: SessionMessage[] = []
    let exists = false
    let more = false
    let title: string | null = null
    if (!readsWholeStore(target.mode)) {
      let fd: number | undefined
      try {
        const size = statSync(target.logPath).size
        exists = true
        const start = Math.max(0, size - PREVIEW_BYTES)
        more = start > 0
        fd = openSync(target.logPath, 'r')
        const bytes = Buffer.allocUnsafe(size - start)
        const read = readSync(fd, bytes, 0, bytes.length, start)
        let text = bytes.subarray(0, read).toString('utf8')
        // A tail can start inside a UTF-8 sequence or a JSON line. Only complete records count.
        if (start > 0) { const newline = text.indexOf('\n'); text = newline < 0 ? '' : text.slice(newline + 1) }
        if (target.mode === 'stdout') messages = stdoutToMessages(text)
        else {
          const parser = newParser(target.mode, sessionKey(target))
          if (!isStoreParser(parser)) parser.pushLines(text.split('\n').slice(0, -1))
          messages = parser.messages
          title = parser.title
          this.saveImages(sessionKey(target), parser, messages)
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('Session preview failed', error)
      } finally { if (fd !== undefined) closeSync(fd) }
    } else {
      try { exists = statSync(target.logPath).isFile() } catch { /* The CLI may not have created it yet. */ }
    }
    return {
      sessionId: target.sessionId, logPath: target.logPath, exists, title,
      messages: messages.slice(-SESSION_PAGE).map(message => ({ ...message, id: `preview:${message.id}` })),
      totalMessages: messages.length, hasMore: more || messages.length > SESSION_PAGE,
      hasNewer: false, indexing: exists, generation: 'preview'
    }
  }

  private async drain(): Promise<void> {
    while (!this.stopped && this.pending.size) {
      const [key, job] = this.pending.entries().next().value!
      this.pending.delete(key)
      this.activeKey = key
      try { await this.ingest(key, job.run, job.target) }
      catch (error) {
        this.readers.delete(key)
        if (!this.stopped) console.warn('Session indexing failed', error)
        this.emit('failed', key, error)
      }
      this.activeKey = null
    }
  }

  private async ingest(key: string, run: Run, target: SessionReadTarget): Promise<void> {
    const stamp = snapshotStamp(target.logPath)
    const saved = repo.getSessionIndex(this.db, key)
    if (saved && saved.evidenceVersion !== DERIVATION_VERSION) {
      /*
       * Re-reading is how a corrected rule reaches what is already recorded, so it has to be
       * able to take something away: a Pull Request the old rule filed as this task's work
       * stays on the task forever if re-reading can only add. Only when there is something to
       * re-derive from - resetting against no durable messages would leave the task with nothing.
       */
      if (saved.total > 0 && !this.rederived.has(run.taskId)) {
        this.rederived.add(run.taskId)
        for (const derivation of this.derivations) derivation.reset?.(this.db, run.taskId)
      }
      // Re-derive from durable messages in bounded batches, even if the original log
      // is gone. A changed rule must not require parsing all history again.
      for (let start = 0; start < saved.total; start += SESSION_PAGE) {
        if (this.stopped) return
        const messages = repo.readSessionMessages(this.db, key, saved.generation, start, SESSION_PAGE)
        inTransaction(this.db, () => this.derive(run, { key, generation: saved.generation, start, messages }))
        await yieldToApp()
      }
      if (this.stopped) return
      repo.finishSessionEvidence(this.db, key, DERIVATION_VERSION)
      this.emit('indexed', key, run.taskId)
    }
    if (stamp === '-|-') return
    if (repo.getSessionIndex(this.db, key)?.stamp === stamp) return
    const stat = statSync(target.logPath)
    let reader = this.readers.get(key)
    if (!reader || reader.inode !== stat.ino || reader.offset > stat.size ||
        (reader.offset === stat.size && !readsWholeStore(target.mode))) {
      const generation = randomUUID()
      const buffer = new IndexedMessages(ordinal => repo.readSessionMessages(this.db, key, generation, ordinal, 1)[0])
      reader = { parser: newParser(target.mode, key, buffer), buffer, offset: 0, inode: stat.ino,
        decoder: new StringDecoder('utf8'), partial: '', generation }
    }
    this.readers.delete(key)
    this.readers.set(key, reader)
    // Running sessions keep only parser metadata and incomplete input. Their completed bodies live in SQLite.
    const { parser, generation, buffer: messageBuffer } = reader
    const persist = async (from: number, messages: SessionMessage[]): Promise<void> => {
      if (from < 0) return
      for (let start = from; start < messages.length; start += SESSION_PAGE) {
        if (this.stopped) return
        const batch = messages.slice(start, start + SESSION_PAGE)
        inTransaction(this.db, () => {
          repo.writeSessionMessages(this.db, key, generation, start, batch)
          this.saveImages(key, parser, batch)
          // Derivation happens at ingestion, never while assembling a screen.
          this.derive(run, { key, generation, start, messages: batch })
        })
        await yieldToApp()
      }
    }
    const persistChanges = async (): Promise<void> => {
      const changes = messageBuffer.takeChanges()
      for (let start = 0; start < changes.length; start += SESSION_PAGE) {
        if (this.stopped) return
        const batch = changes.slice(start, start + SESSION_PAGE)
        const messages = batch.map(entry => entry.message)
        inTransaction(this.db, () => {
          for (const entry of batch) {
            repo.writeSessionMessages(this.db, key, generation, entry.index, [entry.message])
            this.derive(run, { key, generation, start: entry.index, messages: [entry.message] })
          }
          this.saveImages(key, parser, messages)
        })
        await yieldToApp()
      }
    }
    if (isStoreParser(parser)) {
      const result = parser.reload(target.logPath, target.sessionId)
      if (!result.readSucceeded) {
        this.emit('failed', key, new Error('Session store is temporarily unreadable'))
        return
      }
      await persist(result.changedFromIndex, parser.messages)
      reader.offset = stat.size
    } else {
      const fd = openSync(target.logPath, 'r')
      try {
        const buffer = Buffer.allocUnsafe(CHUNK_BYTES)
        while (reader.offset < stat.size && !this.stopped) {
          const length = Math.min(buffer.length, stat.size - reader.offset)
          const read = readSync(fd, buffer, 0, length, reader.offset)
          if (!read) break
          reader.offset += read
          const chunk = reader.decoder.write(buffer.subarray(0, read))
          if (parser.pushChunk) {
            parser.pushChunk(chunk)
            await persistChanges()
          } else {
            const lines = chunk.split('\n')
            if (lines.length === 1) reader.partial += chunk
            else {
              lines[0] = reader.partial + lines[0]
              reader.partial = lines.pop() ?? ''
              parser.pushLines(lines)
              await persistChanges()
            }
          }
          await yieldToApp()
        }
      } finally { closeSync(fd) }
    }
    if (this.stopped) return
    const total = isStoreParser(parser) ? parser.messages.length : messageBuffer.length
    inTransaction(this.db, () => repo.finishSessionIndex(this.db, key, {
      generation, stamp, title: parser.title, total, evidenceVersion: DERIVATION_VERSION
    }))
    if (run.status !== 'running') this.readers.delete(key)
    this.emit('indexed', key, run.taskId)
  }

  /** Hand one persisted page to every derivation. A task that is gone has nothing to file against. */
  private derive(run: Run, batch: SessionBatch): void {
    if (this.derivations.length === 0 || !repo.getTask(this.db, run.taskId)) return
    for (const derivation of this.derivations) derivation.apply(this.db, run, batch)
  }

  private saveImages(key: string, parser: ReturnType<typeof newParser>, messages: SessionMessage[]): void {
    if (!parser.images) return
    for (const message of messages) for (const block of message.blocks) {
      const images = block.kind === 'image' ? [block.image] : block.kind === 'tool' ? block.tool.images : []
      for (const image of images) {
        const data = parser.images.get(image.id)
        if (data) {
          repo.writeSessionImage(this.db, key, image.id, data)
          parser.images.release(image.id)
        }
      }
    }
  }
}
