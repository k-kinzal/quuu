import { spawn, type ChildProcess } from 'node:child_process'
import { afterCommit, inTransaction } from '../db/database.js'
import { recordExecutionState } from '../tasks/execution.js'

import { EventEmitter } from 'node:events'
import { closeSync, existsSync, openSync, writeSync } from 'node:fs'
import type { LogAdapter } from '../agents/cliAdapter.js'
import type { Agent } from '../agents/types.js'
import { runExitPath, runLogPath } from '../appPaths.js'
import type { Db } from '../db/database.js'
import * as repo from '../db/repo.js'
import { t } from '../i18n/index.js'
import { cleanupGitHubAuth, prepareGitHubAuthEnvironment } from '../platform/githubAuth.js'
import { clearExitFile, killProcessGroup, readExitCode, readLogTail } from '../platform/runProcess.js'
import { resolveLoginPath } from '../platform/shellEnv.js'
import type { Project } from '../projects/types.js'
import { captureReviewBaseline } from '../review/git.js'
import { resolveLogPath } from '../session/logAdapters.js'
import { attachSessionLog } from '../session/sessionAttach.js'
import { argsCarrySessionId, canRecoverSessionId, findSessionId } from '../session/sessionIdentity.js'
import { commitIdentityEnv, resolveCommitIdentity } from '../settings/commitIdentity.js'
import type { Task } from '../tasks/types.js'
import { newId, newSessionId, nowIso } from '../util.js'
import type { Classification } from './errorClassifier.js'
import { classifyRunResult, runStatusForKind } from './errorClassifier.js'
import type { TemplateVars } from './templating.js'
import { expandArgs } from './templating.js'
import type { Run, RunKind } from './types.js'

const KILL_GRACE_MS = 5000

/**
 * How often to look for the real session ID, and how long before giving up.
 *
 * Checked finely so short runs are not missed, but all it does is read two small
 * directories, so it costs nothing.
 * If it stays unfound for that long, that CLI leaves no trace, so give up.
 */
const ADOPT_SESSION_POLL_MS = 500
const ADOPT_SESSION_GIVEUP_MS = 2 * 60 * 1000

/**
 * What the sh wrapper around the agent does.
 *
 * 1. Leave the exit code in a file - a run that finishes while Quuu is down can still be
 *    settled on the next launch (restarting the app must not stop agents)
 * 2. Exit with that same code - while Quuu is alive it is picked up from `exit` as before
 *
 * The command and arguments are passed through `"$@"`, so the shell never interprets them
 * (none of the quoting accidents of `shell: true`).
 */
const WRAPPER =
  '"$@"; __quuu_code=$?; if [ -n "${QUUU_GITHUB_HELPER:-}" ]; then "$QUUU_GITHUB_HELPER" cleanup 2>/dev/null || true; fi; printf %s "$__quuu_code" > "$QUUU_EXIT_FILE" 2>/dev/null; exit $__quuu_code'

export interface StartParams {
  task: Task
  project: Project
  agent: Agent
  groupId: string | null
  kind: RunKind
  /** What a resume (follow-up) sends. Falls back to the task prompt when unset. */
  messageOverride?: string
  /** The session ID a resume carries over. */
  sessionId?: string
  fallbackFromRunId: string | null
}

export interface FinishedEvent {
  run: Run
  classification: Classification
  /** The tail of the output. Used for notifications and debug display. */
  tail: string
}

/** What it takes to find the real session ID. Carried around until it is found or given up on. */
interface Adoption {
  taskId: string
  cwd: string
  /** Whose trace to look for. Every adapter keeps it somewhere else. */
  adapter: LogAdapter
  startedAtMs: number
  timer: NodeJS.Timeout | null
}

interface Live {
  child: ChildProcess
  timer: NodeJS.Timeout | null
  adoption: Adoption | null
  githubAuthDir: string | null
  canceled: boolean
  timedOut: boolean
}

/**
 * Launching an agent CLI, and handling its exit.
 *
 * It holds no policy (whether to fall back, what state the task ends in).
 * It launches and classifies the exit result, then hands that to Scheduler via `finished`.
 *
 * A launched agent is **not tied to Quuu's lifetime**. It runs in a detached process group, its
 * output goes straight to a log file's fd, and its exit code is left in a file. Quit Quuu and
 * start it again and the agent keeps running; Scheduler.reconcile() picks the result up.
 */
export class Runner extends EventEmitter {
  private stopped = false
  private live = new Map<string, Live>()

  constructor(private db: Db) {
    super()
  }

  get activeRunIds(): string[] {
    return [...this.live.keys()]
  }

  isLive(runId: string): boolean {
    return this.live.has(runId)
  }

  prepare(params: StartParams): Run {
    if (this.stopped) throw new Error('the run manager has shut down')
    return inTransaction(this.db, () => {
      const { task, project, agent, groupId, kind, fallbackFromRunId } = params
      const runId = newId('run')
      const sessionId = params.sessionId ?? newSessionId()
      const message = params.messageOverride ?? (task.prompt.trim() || task.title)

      const template = kind === 'followup' ? agent.resumeArgsTemplate : agent.argsTemplate
      const vars: TemplateVars = {
        prompt: message,
        title: task.title,
        sessionId,
        projectPath: project.path,
        projectName: project.name,
        taskId: task.id,
        runId
      }
      const args = expandArgs(template, vars)
      const stdoutLog = runLogPath(runId)
      const attempt = repo.listRunsByTask(this.db, task.id).length + 1

      const run = repo.insertRun(this.db, {
        id: runId,
        taskId: task.id,
        agentId: agent.id,
        resolvedFromGroupId: groupId,
        sessionId,
        kind,
        status: 'starting',
        attempt,
        fallbackFromRunId,
        pid: null,
        cwd: project.path,
        command: agent.command,
        args,
        promptPreview: message.slice(0, 500),
        exitCode: null,
        errorKind: null,
        errorMessage: '',
        sessionLogPath: null,
        stdoutLogPath: stdoutLog
      })

      recordExecutionState(this.db, task.id, 'running', { currentRunId: run.id, sessionId })
      return run
    })
  }

  async start(params: StartParams, prepared?: Run): Promise<Run> {
    const { task, project, agent } = params
    const run = prepared ?? this.prepare(params)
    const runId = run.id
    const sessionId = run.sessionId
    const args = run.args
    const stdoutLog = run.stdoutLogPath
    const exitFile = runExitPath(runId)
    if (this.stopped) return run
    if (!existsSync(project.path)) {
      this.fail(run, 'spawn', t('run.projectDirMissing', { path: project.path }))
      return repo.getRun(this.db, runId)!
    }

    if (!repo.getTaskReviewBase(this.db, task.id)) {
      try {
        const baseline = await captureReviewBaseline(project.path, task.id, run.startedAt)
        if (this.stopped) return run
        if (!repo.getTask(this.db, task.id)) return run
        repo.insertTaskReviewBase(this.db, {
          taskId: task.id,
          cwd: project.path,
          ...baseline
        })
      } catch {
        // A failed baseline capture does not stop the run itself. But re-capturing after the start
        // would mix the AI's changes into the baseline, so an empty marker pins it to the fill-from-timestamp path.
        if (this.stopped) return run
        if (!repo.getTask(this.db, task.id)) return run
        repo.insertTaskReviewBase(this.db, {
          taskId: task.id,
          cwd: project.path,
          startedAt: run.startedAt,
          baseHead: null,
          baseTree: null
        })
      }
    }

    const path = await resolveLoginPath()
    if (this.stopped) return run
    const settings = repo.getAppSettings(this.db)
    const identity = resolveCommitIdentity(settings, project)
    const baseEnv: NodeJS.ProcessEnv = {
      ...process.env,
      ...agent.env,
      /*
       * The commit identity goes **after** agent.env.
       *
       * "Record this project under this App's identity" was decided on the project side, and a
       * GIT_AUTHOR_NAME written into the agent definition long ago silently undoing that leaves a
       * false identity in the history.
       * History cannot be fixed afterwards, so overwriting beats being overridden.
      */
      ...commitIdentityEnv(settings, project),
      PATH: path
    }

    let githubAuthDir: string | null = null
    let githubAuthEnv: NodeJS.ProcessEnv
    try {
      const prepared = prepareGitHubAuthEnvironment(identity, project.path, path, baseEnv)
      githubAuthDir = prepared.dir
      githubAuthEnv = prepared.env
    } catch (err) {
      this.fail(run, 'spawn', err instanceof Error ? err.message : String(err))
      return repo.getRun(this.db, runId)!
    }

    const env: NodeJS.ProcessEnv = {
      ...baseEnv,
      // Layered after any human GH_TOKEN left in agent.env and gh's stored login.
      // If GitHub operations alone fell back to the human, commit and PR identities would split again.
      ...githubAuthEnv,
      // Do not leak to the child that it was launched from Electron
      ELECTRON_RUN_AS_NODE: undefined,
      NODE_OPTIONS: undefined,
      QUUU_TASK_ID: task.id,
      QUUU_RUN_ID: runId,
      QUUU_PROJECT: project.name,
      QUUU_EXIT_FILE: exitFile
    }

    // If it was canceled or deleted across the awaits above, do not create the process.
    if (repo.getRun(this.db, runId)?.status !== 'starting' || repo.getTask(this.db, task.id)?.currentRunId !== runId) {
      cleanupGitHubAuth(githubAuthDir)
      return repo.getRun(this.db, runId) ?? run
    }
    clearExitFile(exitFile)

    // Write output straight to the log file instead of through a pipe.
    // With a pipe the reader disappears the moment Quuu exits and the agent dies of EPIPE.
    let logFd: number
    try {
      logFd = openSync(stdoutLog, 'a')
    } catch (err) {
      cleanupGitHubAuth(githubAuthDir)
      this.fail(run, 'spawn', err instanceof Error ? err.message : String(err))
      return repo.getRun(this.db, runId)!
    }
    try {
      writeSync(
        logFd,
        `# Quuu run ${runId}\n# ${nowIso()}\n# cwd: ${project.path}\n# cmd: ${agent.command} ${args
          .map(quoteForDisplay)
          .join(' ')}\n\n`
      )
    } catch {
      // Keep running even if the header could not be written
    }

    let child: ChildProcess
    try {
      child = spawn('/bin/sh', ['-c', WRAPPER, 'Quuu', agent.command, ...args], {
        cwd: project.path,
        env,
        stdio: ['ignore', logFd, logFd],
        // Its own process group, so a signal that kills Quuu (a terminal Ctrl-C, say)
        // does not reach the agent.
        detached: true,
        shell: false
      })
    } catch (err) {
      closeSync(logFd)
      cleanupGitHubAuth(githubAuthDir)
      this.fail(run, 'spawn', err instanceof Error ? err.message : String(err))
      return repo.getRun(this.db, runId)!
    }
    // The child holds its own copy, so the parent's fd can be closed (writing continues after the parent is gone)
    closeSync(logFd)

    const live: Live = {
      child,
      timer: null,
      adoption: null,
      githubAuthDir,
      canceled: false,
      timedOut: false
    }
    this.live.set(runId, live)

    // When the argument template does not pass {{sessionId}} (some CLIs offer no way to), the CLI
    // picks its own session ID. The ID we recorded does not exist, so the real one is picked back up.
    if (!argsCarrySessionId(args, sessionId) && canRecoverSessionId(agent.logAdapter)) {
      this.startSessionAdoption(runId, task.id, project.path, agent.logAdapter)
    }

    child.on('error', (err) => {
      // A failure to launch lands here. Settling it is left to 'exit'.
      try {
        const fd = openSync(stdoutLog, 'a')
        writeSync(fd, `\n[spawn error] ${err.message}\n`)
        closeSync(fd)
      } catch {
        // Keep classifying even if it cannot be written to the log
      }
    })

    if (agent.timeoutSeconds > 0) {
      live.timer = setTimeout(() => {
        live.timedOut = true
        this.terminate(runId)
      }, agent.timeoutSeconds * 1000)
    }

    const updated = repo.updateRun(this.db, runId, {
      status: 'running',
      pid: child.pid ?? null
    })
    recordExecutionState(this.db, task.id, 'running', {
      currentRunId: runId,
      sessionId
    })

    // There is no pipe, so nothing is left unread once 'exit' arrives.
    // Even with a lingering grandchild, it can be settled without waiting for 'close'.
    child.on('exit', (code, signal) => {
      this.finalize(runId, code, signal)
    })

    this.emit('changed')
    return updated
  }

  /**
   * Pin down the session ID the CLI chose for itself and re-record it.
   *
   * While the record stays a lie, import mistakes an agent we launched for an external session and
   * enqueues the task twice (a project with concurrency 1 appears to run two), and the `--resume`
   * of a follow-up and the conversation view break at the same time.
   */
  private startSessionAdoption(
    runId: string,
    taskId: string,
    cwd: string,
    adapter: LogAdapter
  ): void {
    const live = this.live.get(runId)
    if (!live) return
    const adoption: Adoption = { taskId, cwd, adapter, startedAtMs: Date.now(), timer: null }

    adoption.timer = setInterval(() => {
      const done =
        Date.now() - adoption.startedAtMs > ADOPT_SESSION_GIVEUP_MS ||
        this.adoptSessionId(runId, adoption)
      if (!done) return
      this.stopSessionAdoption(runId)
      this.emit('changed')
    }, ADOPT_SESSION_POLL_MS)
    adoption.timer.unref?.()
    live.adoption = adoption
  }

  private stopSessionAdoption(runId: string): void {
    const adoption = this.live.get(runId)?.adoption
    if (!adoption) return
    if (adoption.timer) clearInterval(adoption.timer)
    adoption.timer = null
  }

  /** Write the real session ID back to the run and the task once it is known. true once it is. */
  private adoptSessionId(runId: string, adoption: Adoption): boolean {
    const run = repo.getRun(this.db, runId)
    if (!run) return true

    const claimed = repo.claimedSessionIds(this.db, runId)
    // The (nonexistent) ID we are currently claiming is no reason to rule a candidate out.
    // On a resume, past runs of the same task carry that ID too, so excluding run.id is not enough.
    claimed.delete(run.sessionId)

    const found = findSessionId(adoption.adapter, {
      cwd: adoption.cwd,
      startedAtMs: adoption.startedAtMs,
      claimed
    })
    if (found === null) return false
    if (found === run.sessionId) return true

    repo.setRunSessionId(
      this.db,
      runId,
      found,
      resolveLogPath(adoption.adapter, adoption.cwd, found)
    )
    // A resume's --resume points at the task's ID, so fix that one too
    const task = repo.getTask(this.db, adoption.taskId)
    if (task && task.sessionId === run.sessionId) {
      repo.setTaskSessionId(this.db, adoption.taskId, found)
    }
    return true
  }

  /** Cancel a running run. */
  cancel(runId: string): void {
    inTransaction(this.db, () => {
      const live = this.live.get(runId)
      if (live) {
        afterCommit(this.db, () => {
          live.canceled = true
          this.terminate(runId)
        })
        return
      }

      // A run that outlived an app restart is not in live. Follow the recorded pid to kill it.
      const run = repo.getRun(this.db, runId)
      if (!run || (run.status !== 'running' && run.status !== 'starting')) return

      // If the save is rolled back, the running process is left alone too.
      afterCommit(this.db, () => {
        if (run.pid !== null) {
          killProcessGroup(run.pid, 'SIGTERM')
          const grace = setTimeout(() => killProcessGroup(run.pid!, 'SIGKILL'), KILL_GRACE_MS)
          grace.unref?.()
        }
        clearExitFile(runExitPath(runId))
      })

      const classification: Classification = { kind: 'canceled', message: t('run.canceled') }
      repo.updateRun(this.db, runId, {
        status: 'canceled',
        errorKind: 'canceled',
        errorMessage: classification.message,
        endedAt: nowIso()
      })
      // Hand the policy (what happens to the task) to Scheduler. Deciding it here would leave the
      // task stranded as running.
      this.emit('finished', {
        // A cancel also stops at review. Re-bind so the conversation up to that point stays visible.
        run: attachSessionLog(this.db, repo.getRun(this.db, runId)!),
        classification,
        tail: readLogTail(run.stdoutLogPath)
      } satisfies FinishedEvent)
    })
  }

  private terminate(runId: string): void {
    const live = this.live.get(runId)
    if (!live) return
    const pid = live.child.pid
    if (pid === undefined) return
    killProcessGroup(pid, 'SIGTERM')
    const grace = setTimeout(() => {
      if (this.live.has(runId)) killProcessGroup(pid, 'SIGKILL')
    }, KILL_GRACE_MS)
    grace.unref?.()
  }

  private fail(run: Run, kind: 'spawn', message: string): void {
    repo.updateRun(this.db, run.id, {
      status: 'failed',
      errorKind: kind,
      errorMessage: message,
      endedAt: nowIso()
    })
    const finished = repo.getRun(this.db, run.id)!
    this.emit('finished', {
      run: finished,
      classification: { kind, message },
      tail: message
    } satisfies FinishedEvent)
  }

  private finalize(runId: string, code: number | null, signal: NodeJS.Signals | null): void {
    const live = this.live.get(runId)
    if (!live) return
    if (live.timer) clearTimeout(live.timer)
    if (live.adoption) {
      // The pid file vanishes with the exit, but the session log stays.
      // For a short run that finished ahead of the polling, this is the last chance.
      this.stopSessionAdoption(runId)
      this.adoptSessionId(runId, live.adoption)
    }
    this.live.delete(runId)
    // Clean up the child-side wrapper too. While the app is alive, make sure it goes here as well.
    cleanupGitHubAuth(live.githubAuthDir)

    const run = repo.getRun(this.db, runId)
    if (!run) return

    const exitFile = runExitPath(runId)
    const recorded = readExitCode(exitFile)
    clearExitFile(exitFile)

    const tail = readLogTail(run.stdoutLogPath)
    const agent = repo.getAgent(this.db, run.agentId)
    const classification = classifyRunResult({
      exitCode: recorded ?? code,
      signal,
      output: tail,
      limitPatterns: agent?.limitPatterns ?? [],
      timedOut: live.timedOut,
      canceled: live.canceled
    })

    repo.updateRun(this.db, runId, {
      status: runStatusForKind(classification.kind),
      exitCode: recorded ?? code,
      errorKind: classification.kind,
      errorMessage: classification.message,
      endedAt: nowIso()
    })

    // Re-bind to the session log that was actually written before handing it over. Scheduler copies
    // this run's session ID onto the task, so a mismatch here breaks both resume and conversation.
    const finished = attachSessionLog(this.db, repo.getRun(this.db, runId)!)

    this.emit('finished', {
      run: finished,
      classification,
      tail
    } satisfies FinishedEvent)
  }

  /**
 * On app exit. Running agents are **let go, not killed**.
   *
 * Quuu is rebuilt and restarted constantly. If agents went down with it every time, "queue it and
 * forget it" would not hold. Children are launched detached with their output wired straight to a
 * log file, and the exit code is left in a file, so they keep running once Quuu is gone.
 * The next launch has `Scheduler.reconcile()` pick them back up.
   *
 * To stop an agent, use cancel rather than quitting the app.
   */
  shutdown(): void {
    this.stopped = true
    for (const live of this.live.values()) {
      if (live.timer) clearTimeout(live.timer)
      if (live.adoption?.timer) clearInterval(live.adoption.timer)
      // Detach only the listeners, so an 'exit' arriving mid-shutdown does not touch the DB
      live.child.removeAllListeners()
      live.child.unref()
    }
    this.live.clear()
  }
}

function quoteForDisplay(arg: string): string {
  return /[\s"'$`\\]/.test(arg) ? JSON.stringify(arg) : arg
}
