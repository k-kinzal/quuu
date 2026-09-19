import { statSync } from 'node:fs'
import type { Agent } from '../agents/types.js'
import type { Run } from '../execution/types.js'
import type { Project } from '../projects/types.js'
import { orderTasks } from '../tasks/ordering.js'
import type { Task } from '../tasks/types.js'
import { t } from '../i18n/index.js'
import { contentHash } from './hash.js'
import { LAYOUT, detailPath } from './layout.js'
import type { SyncSnapshot, SyncTask, SyncTaskDetail } from './protocol.js'
import { SYNC_VERSION } from './protocol.js'

import type { Db } from '../db/database.js'
import * as repo from '../db/repo.js'
import { sessionReadTarget } from '../session/sessionAttach.js'
import { nowIso } from '../util.js'
import type { SyncFolder } from './folder.js'
import { readConversationTail } from './sessionText.js'

/**
 * Mac -> iPhone. **Writes out a snapshot of the state.**
 *
 * Only what the list needs, plus the detail for what gets opened and read.
 * The internal `Task` is repacked into a `SyncTask` rather than shipped as-is, so that adding one
 * column to the DB does not stop an older iPhone from reading it.
 */

/** Cap on details written. Writing one per task means iCloud sync never finishes. */
const DETAIL_LIMIT = 150
/** How far back "recent" reaches when choosing what gets a detail file. */
const DETAIL_RECENT_DAYS = 7
/** How many trailing conversation messages are carried. */
const MESSAGE_LIMIT = 60
/** Rough size budget for one detail file. */
const DETAIL_MAX_BYTES = 256 * 1024
/**
 * How many bytes of the session log to read from the end.
 *
 * Only the last 60 messages are carried, so there is no reason to read the whole thing. A single
 * Claude log runs to tens of MB, and reading and parsing all of it **stalls the main process for
 * seconds** (IPC stops with it, so the on-screen log falls behind - that actually happened).
 */
const DETAIL_SCAN_BYTES = 2 * 1024 * 1024
/** How much of the prompt's opening the list carries. */
const EXCERPT = 120
/**
 * How many done tasks are carried into the list.
 *
 * Done tasks only pile up, into the hundreds. Drawing them all on a phone is pointless and makes
 * the snapshot heavy (measured: 378 of them, 181KB).
 * Everything unfinished is always carried; only the done ones are cut, newest first.
 */
const DONE_LIMIT = 50

const REV_KEY = 'mobileSync.rev'

export interface ExportResult {
  /** Whether anything was written (nothing is written when the content is unchanged) */
  wrote: boolean
  rev: number
  details: number
  removed: number
}

export class SyncExporter {
  private readonly db: Db
  private lastSnapshotHash = ''
  /**
   * Fingerprints of the details built last time. **So unchanged ones are not rebuilt.**
   *
   * Building a detail means reading and parsing a session log. The export runs on every state
   * change, so re-reading all 87 of them each time stalls the main process for seconds
   * (the on-screen log falls behind - that actually happened).
   *
   * The key is the task's values plus the **log file's mtime / size**. A `stat` alone costs a few
   * microseconds each.
   */
  private readonly detailKeys = new Map<string, { key: string; hash: string }>()

  constructor(db: Db) {
    this.db = db
  }

  /**
   * One export pass.
   *
   * **Nothing is written when the content is identical.** iCloud spends upload bandwidth on
   * everything written, and the device gets a notification. Rewriting on every 3-second tick
   * would keep sync running all day on a day nothing happened.
   */
  export(folder: SyncFolder, schedulerRunning: boolean): ExportResult {
    folder.ensure()
    // Whoever opens this folder in Files is the same person whose OS language the app follows
    if (!folder.exists(LAYOUT.readme)) folder.write(LAYOUT.readme, t('mobileSync.readme'))

    const projects = repo.listProjects(this.db)
    const priority = new Map(projects.map((p) => [p.id, p.priority]))
    const tasks = orderTasks(repo.listTasks(this.db), (id) => priority.get(id) ?? 9)
    const agents = new Map(repo.listAgents(this.db).map((a: Agent) => [a.id, a]))
    const runCounts = repo.runCountsByTask(this.db)

    const targets = pickDetailTargets(tasks)
    const detailHash = new Map<string, string>()
    const latestRuns = new Map(repo.listLatestRunPerTask(this.db).map((r) => [r.taskId, r]))
    // One readdir tells us what is still there (rather than checking one file at a time)
    const onDisk = new Set(
      folder
        .list(LAYOUT.details)
        .filter((name) => name.endsWith('.json'))
        .map((name) => name.slice(0, -'.json'.length))
    )
    let written = 0

    for (const task of targets) {
      const key = this.detailKey(task, latestRuns.get(task.id) ?? null)
      const cached = this.detailKeys.get(task.id)
      // Nothing moved. **Do not go read the log**
      if (cached?.key === key && onDisk.has(task.id)) {
        detailHash.set(task.id, cached.hash)
        continue
      }

      const detail = this.buildDetail(task, agents)
      detailHash.set(task.id, detail.hash)
      this.detailKeys.set(task.id, { key, hash: detail.hash })

      const relative = detailPath(task.id)
      // Leave it alone if a file with the same fingerprint is already there
      const before = folder.read(relative)
      if (before?.includes(`"hash":"${detail.hash}"`)) continue
      folder.write(relative, JSON.stringify(detail))
      written += 1
    }

    const keep = new Set(targets.map((t) => t.id))
    const removed = this.sweepDetails(folder, keep)
    // Do not remember what dropped off the list (it would grow forever on a Quuu left running)
    for (const id of this.detailKeys.keys()) if (!keep.has(id)) this.detailKeys.delete(id)

    const snapshot = this.buildSnapshot(
      tasks,
      projects,
      runCounts,
      detailHash,
      schedulerRunning
    )
    // Compare the content with rev and time removed (a moving clock alone is not a change)
    const hash = contentHash(JSON.stringify({ ...snapshot, rev: 0, generatedAt: '' }))
    if (hash === this.lastSnapshotHash && written === 0 && removed === 0) {
      return { wrote: false, rev: this.currentRev(), details: 0, removed: 0 }
    }

    this.lastSnapshotHash = hash
    repo.setSetting(this.db, REV_KEY, String(snapshot.rev))
    folder.write(LAYOUT.snapshot, JSON.stringify(snapshot))
    return { wrote: true, rev: snapshot.rev, details: written, removed }
  }

  /**
   * The key describing whether a detail could have changed. **Same key here means same content.**
   *
   * The log is only `stat`ed, never read. An append moves its mtime and size.
   */
  private detailKey(task: Task, last: Run | null): string {
    const parts: unknown[] = [
      task.updatedAt,
      task.title,
      task.prompt,
      task.status,
      task.pendingMessage,
      task.reservedMessage,
      last?.id ?? '',
      last?.status ?? '',
      last?.endedAt ?? '',
      last?.errorMessage ?? ''
    ]
    const target = last ? sessionReadTarget(this.db, last) : null
    if (target) {
      try {
        const info = statSync(target.logPath)
        parts.push(target.mode, target.logPath, info.mtimeMs, info.size)
      } catch {
        // Missing is missing, and that is part of the state too
        parts.push(target.mode, target.logPath, 0, 0)
      }
    }
    return JSON.stringify(parts)
  }

  /** The current rev. Used to check which rev an intent from the iPhone was tapped against. */
  currentRev(): number {
    return Number(repo.getSetting(this.db, REV_KEY) ?? '0')
  }

  private buildSnapshot(
    tasks: Task[],
    projects: Project[],
    runCounts: Map<string, number>,
    detailHash: Map<string, string>,
    schedulerRunning: boolean
  ): SyncSnapshot {
    const latest = new Map(repo.listLatestRunPerTask(this.db).map((r) => [r.taskId, r]))

    const visible = tasks.filter((t) => !t.archived)
    /*
     * Everything unfinished, and only the newest done ones. **The number cut is carried along**
     * (so the iPhone can say that "all" is not really all).
     */
    let done = 0
    let omittedDone = 0
    const carried = visible.filter((task) => {
      if (task.status !== 'done') return true
      done += 1
      if (done <= DONE_LIMIT) return true
      omittedDone += 1
      return false
    })

    const rows: SyncTask[] = carried
      .map((task, index) => {
        const run = latest.get(task.id) ?? null
        return {
          id: task.id,
          projectId: task.projectId,
          title: task.title,
          excerpt: excerpt(task.prompt),
          status: task.status,
          priority: task.priority,
          order: index,
          updatedAt: task.updatedAt,
          runSeq: runCounts.get(task.id) ?? 0,
          lastRun: run
            ? { status: run.status, endedAt: run.endedAt, errorKind: run.errorKind ?? '' }
            : null,
          hasPending: task.pendingMessage.trim().length > 0,
          hasReserved: task.reservedMessage.trim().length > 0,
          detailHash: detailHash.get(task.id) ?? ''
        }
      })

    return {
      version: SYNC_VERSION,
      rev: this.currentRev() + 1,
      generatedAt: nowIso(),
      omittedDone,
      scheduler: {
        running: schedulerRunning,
        activeRuns: repo.countActiveRuns(this.db),
        queued: repo.countTasksByStatus(this.db, 'queued')
      },
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        priority: p.priority,
        enabled: p.enabled
      })),
      tasks: rows
    }
  }

  private buildDetail(task: Task, agents: Map<string, Agent>): SyncTaskDetail {
    const runs = repo.listRunsByTask(this.db, task.id)
    const last = runs[runs.length - 1] ?? null
    const target = last ? sessionReadTarget(this.db, last) : null

    const tail = readConversationTail(
      target?.logPath ?? null,
      target?.mode ?? 'claude',
      target?.sessionId ?? '',
      MESSAGE_LIMIT,
      DETAIL_MAX_BYTES,
      DETAIL_SCAN_BYTES
    )

    const body = {
      version: SYNC_VERSION,
      taskId: task.id,
      generatedAt: '',
      title: task.title,
      prompt: task.prompt,
      status: task.status,
      runSeq: runs.length,
      pendingMessage: task.pendingMessage,
      reservedMessage: task.reservedMessage,
      messages: tail.messages,
      truncated: tail.truncated,
      runs: runs.slice(-10).map((run) => ({
        id: run.id,
        status: run.status,
        agentName: agents.get(run.agentId)?.name ?? '',
        startedAt: run.startedAt,
        endedAt: run.endedAt,
        errorKind: run.errorKind ?? '',
        errorMessage: run.errorMessage ?? ''
      }))
    }
    // The fingerprint excludes the generation time (so a moving clock alone does not rewrite it)
    return { ...body, hash: contentHash(JSON.stringify(body)), generatedAt: nowIso() }
  }

  /** Clean up detail files that dropped off the list. Left alone, conversations of deleted tasks linger. */
  private sweepDetails(folder: SyncFolder, keep: Set<string>): number {
    let removed = 0
    for (const name of folder.list(LAYOUT.details)) {
      if (!name.endsWith('.json')) continue
      if (keep.has(name.slice(0, -'.json'.length))) continue
      folder.remove(`${LAYOUT.details}/${name}`)
      removed += 1
    }
    return removed
  }
}

/**
 * Which tasks get a detail file.
 *
 * What you want to read now (waiting on a human, or moving) and what you follow up on (moved
 * recently). Writing them all would mean thousands of files.
 */
function pickDetailTargets(tasks: Task[]): Task[] {
  const since = Date.now() - DETAIL_RECENT_DAYS * 24 * 60 * 60 * 1000
  return tasks
    .filter((task) => {
      if (task.archived) return false
      if (task.status === 'review' || task.status === 'failed' || task.status === 'running') {
        return true
      }
      return Date.parse(task.updatedAt) >= since
    })
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
    .slice(0, DETAIL_LIMIT)
}

function excerpt(prompt: string): string {
  const line = prompt.trim().split('\n')[0] ?? ''
  return line.length > EXCERPT ? `${line.slice(0, EXCERPT)}…` : line
}
