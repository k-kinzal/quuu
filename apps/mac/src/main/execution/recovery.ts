import { runExitPath } from '../appPaths.js'
import type { Db } from '../db/database.js'
import * as repo from '../db/repo.js'
import { t } from '../i18n/index.js'
import { clearExitFile, isProcessAlive, readExitCode, readLogTail } from '../platform/runProcess.js'
import { attachSessionLog } from '../session/sessionAttach.js'
import { recordExecutionState } from '../tasks/execution.js'
import { ACTIVE_RUN_STATUSES } from '../tasks/status.js'
import { nowIso } from '../util.js'
import { classifyDetachedResult, classifyRunResult, runStatusForKind } from './errorClassifier.js'
import type { FinishedEvent } from './runner.js'
import { Runner } from './runner.js'
import type { Run } from './types.js'
const ADOPT_POLL_MS = 2000

export class ExecutionRecovery {
  private polls = new Set<NodeJS.Timeout>()
  constructor(private db: Db, private runner: Runner, private changed: () => void, private finished: (event: FinishedEvent) => void) { }


  // -------------------------------------------------------------------------
  // Consistency recovery at startup
  // -------------------------------------------------------------------------

  /**
   * Take back over the runs left as running when we last exited.
   *
   * Agents are not tied to Quuu's lifetime (they keep running after the app is quit), so there are
   * three cases to look at.
   *
   *   1. an exit code is there  -> it finished while Quuu was away. Settled with the usual classification
   *   2. the process is alive   -> still running. See it through to its exit (adopt)
   *   3. neither               -> a genuine ghost. Settle it and free the run slot
   */
  reconcile(): void {
    const stale = repo.listActiveRuns(this.db)
    for (const run of stale) {
      if (this.runner.isLive(run.id)) continue
      // An imported session is not a child process of Quuu.
      // Whether it lives is decided by the log's updates, so it must not be called a ghost here.
      if (run.source === 'imported') continue

      const code = readExitCode(runExitPath(run.id))
      if (code !== null) {
        this.finalizeDetached(run, code)
        continue
      }

      if (run.pid !== null && isProcessAlive(run.pid)) {
        this.adopt(run)
        continue
      }

      repo.updateRun(this.db, run.id, {
        status: 'failed',
        errorKind: 'orphaned',
        errorMessage: t('run.orphanedOnRestart'),
        endedAt: nowIso()
      })
      const task = repo.getTask(this.db, run.taskId)
      if (task && task.status === 'running') {
        recordExecutionState(this.db, task.id, 'failed', { currentRunId: run.id })
      }
    }
    if (stale.length > 0) this.changed()
  }


  /** See a surviving agent through to its exit by polling. */
  private adopt(run: Run): void {
    const poll = setInterval(() => {
      if (run.pid !== null && isProcessAlive(run.pid)) return
      clearInterval(poll)
      this.polls.delete(poll)
      // The exit code is written before the process disappears. It can always be read here.
      this.finalizeDetached(run, readExitCode(runExitPath(run.id)))
    }, ADOPT_POLL_MS)
    this.polls.add(poll)
    poll.unref?.()
  }


  /**
   * Settle a run that finished outside Quuu.
   *
   * With an exit code, the usual classification applies (limit fallback included).
   * Without one, do not declare it failed; only pick a limit out of the output.
   * Once settled, the policy goes through the same path as a normal exit (onFinished).
   */
  private finalizeDetached(run: Run, code: number | null): void {
    const current = repo.getRun(this.db, run.id)
    if (!current || !ACTIVE_RUN_STATUSES.includes(current.status)) return

    const agent = repo.getAgent(this.db, run.agentId)
    const limitPatterns = agent?.limitPatterns ?? []
    const tail = readLogTail(run.stdoutLogPath)
    const classification =
      code === null
        ? classifyDetachedResult({ output: tail, limitPatterns })
        : classifyRunResult({
          exitCode: code,
          signal: null,
          output: tail,
          limitPatterns,
          timedOut: false,
          canceled: false
        })
    clearExitFile(runExitPath(run.id))

    repo.updateRun(this.db, run.id, {
      status: runStatusForKind(classification.kind),
      exitCode: code,
      errorKind: classification.kind,
      errorMessage: classification.message,
      endedAt: nowIso()
    })

    this.finished({
      run: attachSessionLog(this.db, repo.getRun(this.db, run.id)!),
      classification,
      tail
    })
  }
  stop(): void { for (const poll of this.polls) clearInterval(poll); this.polls.clear() }
}
