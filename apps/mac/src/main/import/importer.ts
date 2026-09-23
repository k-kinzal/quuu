import { adapterFor } from '../agent-adapters/registry.js'
import { existsSync } from 'node:fs'
import { basename } from 'node:path'
import type { LogAdapter } from '../agents/cliAdapter.js'
import { adapterOfExternalKey } from '../agents/cliAdapter.js'
import type { Run } from '../execution/types.js'
import { PROJECT_COLORS } from '../projects/defaults.js'
import type { AppSettings } from '../settings/types.js'
import { importExternalSession, refreshImportedSession } from '../tasks/importSession.js'

import { externalAgentName } from '../agents/catalog.js'
import type { Db } from '../db/database.js'
import * as repo from '../db/repo.js'
import { lastWrittenMs, resolveLogPath } from '../session/logAdapters.js'
import { nowIso, truncate } from '../util.js'
import type { ExternalSession } from './adapters.js'
import { discoverSessions, startedByProgram } from './adapters.js'
import type { LivenessProbe } from './liveness.js'
import { probeLiveSessions } from './liveness.js'
import { t } from '../i18n/index.js'

/**
 * Import sessions started directly from Claude Code / Codex.
 *
 * The goal: open Quuu and see what is running now and what has been done.
 * We prioritize state consistency over perfect reproduction:
 *
 *   - Import is idempotent. Running it any number of times never duplicates (matched by external_key)
 *   - What is moving is "running", everything else is "done"
 *   - On each re-sync, whatever stopped drops to "done" (self-reconciling)
 *   - Tasks a human touched are never overwritten
 *
 * Imported projects get no execution target assigned,
 * so Quuu's scheduler never starts agents on external projects on its own.
 */

/**
 * Grace period when the liveness probe says "finished".
 *
 * Only absorbs the small gap between the process disappearing and the log's
 * last write becoming visible. As long as the probe works, stop is settled within this time.
 */
const STOP_GRACE_MS = 15 * 1000

/**
 * A liveness marker whose process cannot be confirmed counts as debris after this much silence.
 *
 * Not applied when the process itself was confirmed. During a long tool call the log
 * can legitimately go silent for hours, so silence alone cannot justify "finished".
 */
const STALE_SIGNAL_MS = 30 * 60 * 1000

const MAX_PER_SYNC = 400

export interface ImportResult {
  scanned: number
  createdTasks: number
  createdProjects: number
  updated: number
  running: number
  /** Count deliberately not imported (subagents, old logs from before a deletion). */
  skipped: number
}

export class SessionImporter {
  constructor(private db: Db) { }

  sync(settings: AppSettings, now = Date.now()): ImportResult {
    const result: ImportResult = {
      scanned: 0,
      createdTasks: 0,
      createdProjects: 0,
      updated: 0,
      running: 0,
      skipped: 0
    }
    if (!settings.importExternalSessions) return result

    const since =
      settings.importHistoryDays > 0
        ? new Date(now - settings.importHistoryDays * 24 * 60 * 60 * 1000)
        : null

    const sessions = discoverSessions({ since, limit: MAX_PER_SYNC })
    result.scanned = sessions.length

    // Never import sessions Quuu itself started
    const own = repo.managedSessionIds(this.db)

    const probe = probeLiveSessions(now)

    for (const session of sessions) {
      if (own.has(session.sessionId)) continue
      /*
       * Do not list subagents.
       *
       * A run started by a skill or another agent is not "work that person did".
       * Observed: out of 684 sessions a chunk (claude sdk-cli 231 / codex exec family)
       * fell in this bucket — nearly half the list was not human work.
       */
      if (startedByProgram(session.entrypoint)) {
        result.skipped += 1
        continue
      }
      const running = isRunning(
        session.adapter,
        session.sessionId,
        now - Date.parse(session.updatedAt),
        probe
      )
      if (running) result.running += 1

      const existing = this.findByKey(session.key)
      if (existing) {
        if (this.refresh(existing.runId, existing.taskId, session, running)) result.updated += 1
        continue
      }

      // Even without a session ID match, if we were running something at the same
      // place and time, that is an agent Quuu started. Importing it makes the same
      // job appear twice and fills the project's concurrency slots doubly.
      //
      // Check only on creation. Skipping already-imported ones too would leave
      // previously imported tasks stranded out of sync.
      if (repo.hasOwnRunCovering(this.db, session.cwd, session.startedAt)) continue
      /*
       * A report being written is an agent too, and leaves the same trace. Imported, it shows up
       * as a task nobody asked for — appearing, confusingly, while other work is running.
       */
      if (repo.hasOwnReportCovering(this.db, session.cwd, session.startedAt)) continue

      const project = this.resolveProject(session, settings, result)
      if (!project) continue

      this.create(session, project.id, running)
      result.createdTasks += 1
    }

    return result
  }

  /**
   * Re-check only the imported sessions that are "running".
   *
   * A full sync reads hundreds of logs so once a minute is its ceiling, but this
   * only stats the few running ones and can run on a short cycle.
   * It exists to remove the wait where a stop is not reflected "until the next sync".
   *
   * Sessions no longer discovered (outside the import window, over the count limit,
   * log deleted) also get settled here. sync can only fix what it finds, so without
   * this path they would stay running forever.
   */
  refreshRunning(now = Date.now()): number {
    const runs = repo.listActiveRuns(this.db).filter((r) => r.source === 'imported')
    if (runs.length === 0) return 0

    const probe = probeLiveSessions(now)
    let changed = 0

    for (const run of runs) {
      const task = repo.getTask(this.db, run.taskId)
      if (!task) continue

      const path = this.locateLog(run)
      // The session id matters for a store shared by every session: the file's own timestamp
      // would report someone else's work as this session still being busy
      const mtimeMs = path === null ? null : lastWrittenMs(adapterOf(run), path, run.sessionId)
      // If the log is gone there is no way left to follow it. Close it rather than leave it running.
      const idleMs = mtimeMs === null ? Number.POSITIVE_INFINITY : now - mtimeMs

      if (isRunning(adapterOf(run), run.sessionId, idleMs, probe)) continue

      const endedAt = mtimeMs === null ? nowIso() : new Date(mtimeMs).toISOString()
      if (refreshImportedSession(this.db, run, task, false, endedAt)) changed += 1
    }
    return changed
  }

  /**
   * If the recorded log path is gone, search again.
   * Claude Code can move its log location mid-session; concluding "finished" just
   * because it is missing would mark running sessions as done.
   */
  private locateLog(run: Run): string | null {
    const recorded = run.sessionLogPath ?? run.stdoutLogPath
    if (recorded && existsSync(recorded)) return recorded

    const found = resolveLogPath(adapterOf(run), run.cwd, run.sessionId)
    if (found) repo.updateRun(this.db, run.id, { sessionLogPath: found })
    return found
  }

  // -------------------------------------------------------------------------

  private findByKey(key: string): { runId: string; taskId: string } | null {
    return repo.findImportedRun(this.db, key)
  }

  /**
   * Bring an existing import up to date.
   * Tasks a human touched (marked done, sent back, etc.) are never overwritten.
   */
  private refresh(
    runId: string,
    taskId: string,
    session: ExternalSession,
    running: boolean
  ): boolean {
    const run = repo.getRun(this.db, runId)
    const task = repo.getTask(this.db, taskId)
    if (!run || !task) return false

    let changed = false

    // Right after start the title may not be readable yet. Swap it in when it appears later.
    // Names a human re-assigned are never overwritten.
    if (session.title && isPlaceholderTitle(task.title) && task.source === 'imported') {
      repo.patchTask(this.db, taskId, { title: truncate(session.title, 160) })
      changed = true
    }

    if (refreshImportedSession(this.db, run, task, running, session.updatedAt)) changed = true

    return changed
  }

  private create(session: ExternalSession, projectId: string, running: boolean): void {
    importExternalSession(this.db, session, projectId, running, this.ensureAdapterAgent(session.adapter, session.command))
  }

  private resolveProject(
    session: ExternalSession,
    settings: AppSettings,
    result: ImportResult
  ): { id: string } | null {
    const match = repo.findProjectByPath(this.db, session.cwd)
    if (match) {
      /*
       * How deleted projects are handled.
       *
       *   Session started before the deletion time … not imported (respect the intent to delete)
       *   Session started after the deletion time  … it is in use again = bring it back into view
       *
       * We do not decide by "was it imported yet", because old logs that slipped
       * through the import window or the count limit would look "new" and come back.
       */
      if (startedBefore(session.startedAt, match.importSince)) {
        result.skipped += 1
        return null
      }
      if (match.deletedAt) {
        repo.reviveProject(this.db, match.id)
        result.createdProjects += 1
      }
      return match
    }

    if (!settings.importCreateProjects) return null
    if (!existsSync(session.cwd)) return null

    const projects = repo.listProjects(this.db)
    const created = repo.insertProject(this.db, {
      name: basename(session.cwd) || session.cwd,
      path: session.cwd,
      color: PROJECT_COLORS[projects.length % PROJECT_COLORS.length],
      priority: 5,
      // No execution target assigned. Keeps the scheduler from starting
      // agents on its own in a project that was merely imported.
      targetKind: 'agent',
      targetId: null,
      maxConcurrent: 1,
      enabled: true,
      source: 'imported',
      sortOrder: projects.length
    })
    result.createdProjects += 1
    return created
  }

  /**
   * Agent definition dedicated to import.
   *
   * Kept permanently disabled so it can never enter the scheduler's candidates.
   *
   * Names are split per adapter. If every row just said "imported", the run
   * history could no longer tell which CLI's history it was.
   * `source: 'imported'` marks it as Quuu's property and keeps it out of settings.
   * Lookup goes by marker and adapter too. Looking up by name would leave room to
   * grab a same-named definition the user created that merely shares the marker.
   */
  private ensureAdapterAgent(adapter: LogAdapter, command: string): string {
    const existing = repo
      .listAgents(this.db)
      .find((a) => a.source === 'imported' && a.logAdapter === adapter)
    if (existing) return existing.id

    return repo.insertAgent(this.db, {
      name: externalAgentName(adapter),
      description: t('seed.importedAgent'),
      command,
      argsTemplate: [],
      resumeArgsTemplate: [],
      env: {},
      concurrency: 1,
      fallbackAgentId: null,
      limitPatterns: [],
      cooldownSeconds: 0,
      timeoutSeconds: 0,
      logAdapter: adapter,
      enabled: false,
      source: 'imported',
      sortOrder: 90
    }).id
  }
}

/**
 * Is the session running?
 *
 *   1. Finish marker present                     … finished (Copilot writes down that it ended)
 *   2. Liveness marker and the process is alive  … running (silence does not close it)
 *   3. Liveness marker only                      … running for a while (debris gets closed after the deadline)
 *   4. No marker where the probe is authoritative … finished (wait only a short grace)
 *   5. Probe unavailable                          … judge by time since last update (legacy behavior)
 *
 * Called from both import and the periodic check. If the two disagreed we would get
 * flapping — one marks it done, the other flips it back to running — so the
 * decision is concentrated in this one place.
 */
export function isRunning(
  adapter: LogAdapter,
  sessionId: string,
  idleMs: number,
  probe: LivenessProbe
): boolean {
  // A finish marker means finished even if the last write was moments ago (Copilot)
  if (probe.finished(adapter, sessionId)) return false
  if (probe.has(adapter, sessionId)) {
    // Normally avoid OS queries; only trace down to the process once it might be debris.
    if (idleMs < STALE_SIGNAL_MS) return true
    return probe.confirmed(adapter, sessionId) === true
  }
  if (probe.authoritative(adapter, sessionId)) return idleMs < STOP_GRACE_MS
  return idleMs < adapterFor(adapter).idleWindowMs
}

/**
 * Did the session start before the deletion time?
 *
 * Not a string comparison, because log timestamps are not guaranteed a uniform shape
 * (mixing UTC's Z with offset notation breaks string ordering).
 * Unreadable times fall to "not before". Missing a run made after the deletion hurts more.
 */
function startedBefore(startedAt: string, since: string | null): boolean {
  if (!since) return false
  const a = Date.parse(startedAt)
  const b = Date.parse(since)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false
  return a <= b
}

/** A run keeps the adapter captured when it was imported. */
export function adapterOf(run: Run): LogAdapter {
  return run.logAdapter ?? adapterOfExternalKey(run.externalKey) ?? 'stdout'
}

/**
 * Is this the placeholder title assigned at import time?
 *
 * Shape: `<command> <word for session> <ID prefix>`. The word comes from the language
 * the title was written in, and **titles already stored keep the word they were created
 * with** — databases from before this repository moved to English hold the Japanese one.
 * So every language's word has to stay matchable here; drop one and those tasks stop
 * counting as unrenamed, and import quietly stops updating their titles.
 *
 * Matching by shape rather than by a list of commands keeps this from going stale on one
 * side every time a CLI is added.
 */
const PLACEHOLDER_WORDS = ['session', 'セッション']

function isPlaceholderTitle(title: string): boolean {
  const words = PLACEHOLDER_WORDS.join('|')
  return new RegExp(`^[a-z][a-z-]* (?:${words}) [0-9a-f]{8}$`).test(title)
}

export function importedAt(): string {
  return nowIso()
}
