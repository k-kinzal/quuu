import { rmSync } from 'node:fs'
import type { Db } from '../db/database.js'
import * as repo from '../db/repo.js'
import type { ReportHistoryEntry } from './types.js'

/** A report's pages, newest first, with the one it shows now marked. */
export function reportHistory(db: Db, owner: repo.ReportOwner, current: string): ReportHistoryEntry[] {
  return repo.listReportHistory(db, owner).map(entry => ({ ...entry, current: entry.path === current }))
}

/**
 * Remove report pages generated more than `days` days ago. 0 keeps everything.
 *
 * A page that was replaced is no longer deleted when its successor lands, so this is the only
 * thing that takes one away - and never the page a report shows now, however old.
 */
export function pruneReportHistory(db: Db, days: number, now = new Date()): number {
  if (!(days > 0)) return 0
  const before = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
  const expired = repo.expiredReportHistory(db, before)
  for (const entry of expired) {
    // The generator's log and exit file sit beside the page under the same name.
    const base = entry.path.replace(/\.html$/, '')
    try { for (const file of new Set([entry.path, `${base}.log`, `${base}.exit`])) rmSync(file, { force: true }) }
    catch (error) { console.warn('Could not remove an old report page', error) }
    repo.deleteReportHistory(db, entry.id)
  }
  return expired.length
}
