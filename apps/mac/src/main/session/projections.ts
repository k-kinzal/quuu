import { setImmediate as yieldToApp } from 'node:timers/promises'
import type { Db } from '../db/database.js'
import * as repo from '../db/repo.js'
import type { SessionIndex } from './index.js'

/** History discovery must yield too: resolving missing logs can search an entire provider tree. */
export class SessionProjections {
  private work: Promise<void> | null = null
  private stopped = false
  private signatures = new Map<string, string>()
  private historicalProbeAt = 0

  constructor(private db: Db, private sessions: SessionIndex) { }

  refresh(): Promise<void> {
    if (this.stopped) return Promise.resolve()
    if (!this.work) this.work = this.scan().finally(() => { this.work = null })
    return this.work
  }

  stop(): void { this.stopped = true }

  private async scan(): Promise<void> {
    // Return to bootstrap before even listing history, so the first window can open.
    await yieldToApp()
    if (this.stopped) return
    const runs = repo.listRunsForProjection(this.db)
    const probeHistory = Date.now() >= this.historicalProbeAt
    if (probeHistory) this.historicalProbeAt = Date.now() + 60_000
    runs.sort((a, b) => Number(b.status === 'running') - Number(a.status === 'running') || b.startedAt.localeCompare(a.startedAt))
    for (const saved of runs) {
      if (this.stopped) return
      const previousSignature = `${saved.status}:${saved.sessionId}:${saved.sessionLogPath}`
      if (!probeHistory && saved.status !== 'running' && this.signatures.get(saved.id) === previousSignature) continue
      // A task can be removed or its run rebound while the previous lookup yields.
      const run = repo.getRun(this.db, saved.id)
      if (!run) { this.signatures.delete(saved.id); continue }
      const signature = `${run.status}:${run.sessionId}:${run.sessionLogPath}`
      try {
        this.sessions.request(run)
        this.signatures.set(run.id, signature)
      } catch (error) { console.warn('Cannot schedule session indexing', error) }
      await yieldToApp()
    }
  }
}
