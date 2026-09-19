import { EventEmitter } from 'node:events'
import { isManagedAgent } from '../agents/types.js'
import type { Project } from '../projects/types.js'
import type { ToastPayload } from '../snapshot.js'
import { consumeReservation, recordExecutionState } from '../tasks/execution.js'
import { holdsSlot } from '../tasks/status.js'
import type { Task } from '../tasks/types.js'
import { isFollowupPending } from '../tasks/types.js'
import { canClaimTask, consecutiveFailures, cooldownUntil, resumeMessage, retryRequirement, runDisposition, shouldRetryRun, slotAvailability } from './conditions.js'
import type { Classification } from './errorClassifier.js'
import { ExecutionRecovery } from './recovery.js'
import type { StartParams } from './runner.js'
import type { AgentSlotStatus, SchedulerStatus, SlotHold } from './status.js'
import type { Run, RunErrorKind } from './types.js'
import { isModelLimit, weeklyLimitLiftsAt } from './weeklyWindow.js'

import type { Db } from '../db/database.js'
import { afterCommit, inTransaction } from '../db/database.js'

import { runTaskRules } from '../automation/evaluate.js'
import { deliveredInstructions } from '../session/delivery.js'
import * as repo from '../db/repo.js'
import { newId, nowIso, truncate } from '../util.js'
import { t } from '../i18n/index.js'
import type { ResolveFailure, SessionOwner } from './agentResolver.js'
import { candidateAgents, cooldownClearsAt, fallbackHolds, hasAnyUsableCandidate, resolveAgentForProject, resolveFailureMessage, sessionOwner, sessionOwnerLabel } from './agentResolver.js'
import type { FinishedEvent } from './runner.js'
import { Runner } from './runner.js'

/** How many stuck tasks the status names outright. The rest are reported as a count. */
const STUCK_WARNING_LIMIT = 3

/**
 * How often to check on a run we took back over.
 *
 * Restarting the app happens all the time, so this path is routine, not exception handling.
 * How long a finished run lingers as "running" is felt directly, so keep it short.
 */


interface Claim {
  task: Task
  project: Project
  agentId: string
  groupId: string | null
  params: StartParams
  run: Run
}

export interface SchedulerEvents {
  changed: () => void
  notify: (toast: ToastPayload) => void
  status: (status: SchedulerStatus) => void
}

/**
 * The resident loop that conditionally claims from the queue and launches when a slot frees up.
 *
 * The point is to stop a human from having to be the scheduler, so it never asks the user
 * anything on the happy path. Limits fall back automatically, and only what genuinely needs
 * hands is handed over.
 */
export class Scheduler extends EventEmitter {
  private stopped = false
  private nextTick: NodeJS.Timeout | null = null
  private timer: NodeJS.Timeout | null = null
  private ticking = false
  private recovery: ExecutionRecovery
  private enabled = true
  private lastTickAt: string | null = null
  /** The status last handed out, so an unchanged one is not repeated. */
  private announced: string | null = null
  private blockReasons = new Map<string, string>()
  /**
   * Ways of being stuck that waiting never resolves (task ID -> reason).
   *
   * Unlike a full slot or a cooldown, this stays exactly as it is until a human moves it.
   * So **it is shown even while other things are running**. Sitting quietly in the queue is the
   * hardest state to notice.
   */
  private stuckReasons = new Map<string, string>()
  /** Warnings such as "the automation rules could not be read". Surfaced in the status. */
  private ruleWarnings: string[] = []
  private tickIntervalMs = 3000

  constructor(
    private db: Db,
    private runner: Runner
  ) {
    super()
    this.recovery = new ExecutionRecovery(db, runner, () => this.emit('changed'), (event) => this.onFinished(event))
    this.runner.on('finished', (e: FinishedEvent) => this.onFinished(e))
    this.runner.on('changed', () => this.emit('changed'))
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  start(tickIntervalMs: number): void {
    this.stopped = false
    this.tickIntervalMs = Math.max(500, tickIntervalMs)
    if (this.timer) clearInterval(this.timer)
    this.timer = setInterval(() => void this.tick(), this.tickIntervalMs)
    void this.tick()
  }

  reconcile(): void { this.recovery.reconcile() }

  stop(): void {
    this.stopped = true
    if (this.nextTick) clearTimeout(this.nextTick)
    this.nextTick = null
    this.recovery.stop()
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  pause(): SchedulerStatus {
    this.enabled = false
    this.emitStatus()
    return this.status()
  }

  resume(): SchedulerStatus {
    this.enabled = true
    this.emitStatus()
    void this.tick()
    return this.status()
  }

  get isEnabled(): boolean {
    return this.enabled
  }

  /** Something changed, so run one tick right now. */
  kick(): void {
    void this.tick()
  }

  // -------------------------------------------------------------------------
  // tick
  // -------------------------------------------------------------------------

  async tick(): Promise<void> {
    if (this.stopped || this.ticking) return
    this.ticking = true
    try {
      this.lastTickAt = nowIso()
      if (!this.enabled) return

      // Run the enqueue side before claiming, so what it adds lands in this same tick and is not one round late.
      // Nothing is enqueued while paused, or pausing would mean nothing (hence: after the return above)
      this.applyTaskRules()

      // No cap on how many can start in one tick. Fill as long as the claim conditions hold.
      // Stop the moment nothing more can be claimed.
      let started = 0
      for (let guard = 0; guard < 64; guard++) {
        const claim = this.claimNext()
        if (!claim) break

        const promise = this.runner.start(claim.params, claim.run)
        await promise
        started++
        if (this.stopped) return
      }
      // A tick that found nothing to do changed nothing. Announcing one anyway made every
      // window rebuild its whole picture every few seconds; rules and the runner already
      // announce what they change, so only a tick that started something speaks.
      if (started > 0) this.emit('changed')
      this.emitStatus()
    } finally {
      this.ticking = false
    }
  }

  /**
   * Evaluate the automation rules and enqueue whatever has its conditions met.
   *
   * A failure here does not stop claiming from the queue. Trouble on the enqueue side stopping
   * tasks that already exist does more harm (the reason shows in the status, so it never stalls silently).
   */
  private applyTaskRules(): void {
    try {
      const result = runTaskRules(this.db)
      this.ruleWarnings = result.warnings
      if (result.created.length > 0) this.emit('changed')
    } catch {
      this.ruleWarnings = [t('scheduler.automationEvalFailed')]
    }
  }

  private kindFor(task: Task): 'initial' | 'followup' {
    return isFollowupPending(task) ? 'followup' : 'initial'
  }

  private messageFor(task: Task): string | undefined {
    if (this.kindFor(task) !== 'followup') return undefined
    return resumeMessage(task.pendingMessage, this.alreadyDelivered(task))
  }

  /**
   * How much of the waiting instruction the agent is already holding.
   *
   * A resume that died against a limit still handed its instruction over: the CLI wrote it into
   * the session before it had anything to answer with. The whole stretch of attempts that never
   * got an answer is read, not just the last one — a second attempt leaves its own line in the
   * session, and looking only at that one would make the instruction underneath read as
   * undelivered all over again. Nothing before a run that finished counts: whatever waits here
   * was written after it.
   */
  private alreadyDelivered(task: Task): string[] {
    let unanswered: Run | null = null
    for (const run of repo.listRunsByTask(this.db, task.id)) {
      if (run.status === 'succeeded' || run.sessionId !== task.sessionId) break
      unanswered = run
    }
    return unanswered ? deliveredInstructions(this.db, unanswered) : []
  }

  /** An initial run always opens a new session. Only a resume inherits the existing one. */
  private sessionIdFor(task: Task): string | undefined {
    return this.kindFor(task) === 'followup' ? (task.sessionId ?? undefined) : undefined
  }

  /**
   * For a resume, the owner of the session being continued. For an initial run, null (no narrowing).
   *
   * It is not only the session ID that carries over. Without carrying over **who opened it**,
   * the run gets handed to someone else purely because their slot happened to be free.
   */
  private continuationFor(task: Task): SessionOwner | null {
    return this.kindFor(task) === 'followup' ? sessionOwner(this.db, task) : null
  }

  private previousFailedRunId(taskId: string): string | null {
    const runs = repo.listRunsByTask(this.db, taskId)
    const last = runs[0]
    if (!last) return null
    return last.status === 'limited' || last.status === 'failed' || last.status === 'timeout'
      ? last.id
      : null
  }

  // -------------------------------------------------------------------------
  // Conditional claim
  // -------------------------------------------------------------------------

  /**
   * Claim one task from the queue and move it to `running`.
   *
   * Conditions (all must hold):
   *   1. status = queued
   *   2. scheduled_at is unset, or already past
   *   3. the project is enabled and not archived
   *   4. **every** blocker condition is satisfied (ordering)
   *   5. project running count + reservations < the project's concurrency limit
   *   6. an agent resolves (enabled, out of cooldown, room in its concurrency once reservations are taken out)
   *
   * The "reservations" in 5 and 6 are the slots unfinished P0 tasks keep (`holdsSlot`). A
   * reservation means **do not give the slot to a task that has not reserved one**, so it is not
   * counted when judging the reserving task itself.
   *
   * Order: follow-up (a resume from review) -> project priority -> task priority -> entry order
   *
   * The check and the transition happen together inside a BEGIN IMMEDIATE transaction, so the
   * same task can never be claimed twice.
   */
  claimNext(): Claim | null {
    return inTransaction(this.db, () => {
      const now = nowIso()
      const reservations = repo.listSlotReservations(this.db)
      const rows = repo.readyTaskIds(this.db, now)

      const reasons = new Map<string, string>()
      const stuck = new Map<string, string>()

      for (const row of rows) {
        const project = repo.getProject(this.db, row.project_id)
        if (!project) continue

        const pending = repo.getTask(this.db, row.task_id)
        if (!pending || !canClaimTask(pending, project, now)) continue

        // Condition 4: blocker conditions (ordering). Skip if even one is left
        const blockers = repo.unsatisfiedBlockers(this.db, pending)
        if (blockers.length > 0) {
          const vars = { task: truncate(pending.title, 24), blocker: truncate(blockers[0].title, 24) }
          reasons.set(
            `dep:${pending.id}`,
            blockers.length > 1
              ? t('scheduler.waitingOnBlockerMore', { ...vars, count: blockers.length - 1 })
              : t('scheduler.waitingOnBlocker', vars)
          )
          continue
        }

        // A reservation means "do not give the slot to a task that has not reserved one".
        // The reserving side is not blocked by it and competes normally within the usual limit.
        // (Otherwise two tasks reserving the same slot deadlock each other and neither moves.)
        const others = holdsSlot(pending.priority) ? [] : reservations

        // Condition 5: the project's concurrency limit (reserved slots do not count as free)
        const active = repo.countActiveRunsByProject(this.db, project.id)
        const heldHere = others.filter((r) => r.projectId === project.id)
        if (slotAvailability(active, heldHere.length, project.maxConcurrent) !== 'available') {
          reasons.set(
            project.id,
            active < project.maxConcurrent
              ? t('scheduler.slotHeldByTask', { project: project.name, holder: holdLabel(heldHere) })
              : t('scheduler.concurrencyLimit', { project: project.name, max: project.maxConcurrent })
          )
          continue
        }

        const task = repo.getTask(this.db, row.task_id)
        if (!task) continue

        // Condition 6: resolve the agent (a per-task override wins)
        const continuation = this.continuationFor(task)
        const resolved = resolveAgentForProject(this.db, project, {
          preferredAgentId: task.agentOverrideId,
          reserved: reservedByAgent(others),
          continuation
        })
        if (!resolved.ok) {
          const label = `${project.name}: ${this.resolveFailureLabel(project, resolved.reason, others, continuation)}`
          // "Cannot continue" is a fact about the task, not the project. Keying it by project would
          // overwrite the reason for another task in the same project, so it is kept per task
          if (resolved.reason === 'no-continuable-agent') {
            stuck.set(task.id, `${truncate(task.title, 24)} — ${label}`)
          } else {
            reasons.set(project.id, label)
          }
          continue
        }

        // Move to running as part of the claim. Other ticks stop seeing it from here on.
        const params: StartParams = {
          task, project, agent: resolved.value.agent, groupId: resolved.value.groupId,
          kind: this.kindFor(task), messageOverride: this.messageFor(task),
          sessionId: this.sessionIdFor(task), fallbackFromRunId: this.previousFailedRunId(task.id)
        }
        const run = this.runner.prepare(params)
        this.blockReasons = reasons
        this.stuckReasons = stuck
        return {
          task,
          project,
          params, run,
          agentId: resolved.value.agent.id,
          groupId: resolved.value.groupId
        }
      }

      this.blockReasons = reasons
      this.stuckReasons = stuck
      return null
    })
  }

  /**
   * The wording for why an agent could not be resolved.
   *
   * When a reservation is what blocks it, name **who is holding it**.
   * Stalling silently is the worst failure mode, so anything nameable gets named.
   */
  private resolveFailureLabel(
    project: Project,
    reason: ResolveFailure,
    others: repo.SlotReservation[],
    continuation?: SessionOwner | null
  ): string {
    // The party we are waiting on can be named. "Session" alone says nothing about what to fix
    if (reason === 'no-continuable-agent') {
      const owner = continuation ? sessionOwnerLabel(this.db, continuation) : ''
      return owner.length > 0
        ? t('tasks.sessionOwnerUnavailable', { owner })
        : resolveFailureMessage(reason)
    }
    if (reason !== 'all-reserved') return resolveFailureMessage(reason)
    const ids = new Set(candidateAgents(this.db, project).map((a) => a.id))
    const holders = others.filter((r) => r.agentId !== null && ids.has(r.agentId))
    return t('scheduler.slotHeld', { holder: holdLabel(holders) })
  }

  // -------------------------------------------------------------------------
  // Policy on finishing
  // -------------------------------------------------------------------------

  private onFinished(event: FinishedEvent): void {
    if (this.stopped) return
    inTransaction(this.db, () => {
      const { run, classification } = event
      const task = repo.getTask(this.db, run.taskId)
      if (!task) {
        afterCommit(this.db, () => this.emit('changed'))
        return
      }

      const until = cooldownUntil(classification.kind,
        repo.getAgent(this.db, run.agentId)?.cooldownSeconds,
        classification.retryAt ?? this.weekTurnsAt(run.agentId, classification), nowIso())
      if (until !== null) {
        repo.setCooldown(this.db, run.agentId, until,
          classification.kind === 'auth' ? t('runErrorKind.auth') : classification.message || 'Limit')
      }

      const project = repo.getProject(this.db, task.projectId)
      const retry = classification.kind !== null && project !== null &&
        this.shouldAutoRetry(classification.kind, task, project, run)
      const disposition = runDisposition(task, classification.kind, retry)
      recordExecutionState(this.db, task.id, disposition.status, {
        currentRunId: run.id,
        sessionId: run.sessionId,
        ...('pendingMessage' in disposition ? { pendingMessage: disposition.pendingMessage } : {})
      })
      switch (disposition.kind) {
        case 'retry':
          this.parkUntilAgentReturns(task.id)
          break
        case 'send-reserved':
          consumeReservation(this.db, task.id)
          this.notify('info', t('scheduler.sentReserved', { title: truncate(task.title, 50) }), task.id)
          break
        case 'review':
          this.notify('success', t('scheduler.reviewToast', { title: truncate(task.title, 60) }), task.id)
          /*
           * Something is now waiting to be read. What happens next is not execution's business —
           * it only says when, and the listener decides whether anything is worth generating.
           */
          afterCommit(this.db, () => this.emit('review', task.id))
          break
        case 'failed':
          this.notify('error', t('scheduler.failedToast', { title: truncate(task.title, 50) }), task.id, classification.message || undefined)
          break
      }
      this.afterTransition()
    })
  }

  /**
   * When a limit that named no moment lifts, for the one kind of limit whose length is known.
   *
   * Only a limit on a single model. Those are a share of the account's **week** and never print
   * their moment; the account's own windows do print theirs, and guessing a week at a five-hour
   * wall would idle an account that is back after lunch. Details in
   * [weeklyWindow.ts](weeklyWindow.ts).
   */
  private weekTurnsAt(agentId: string, classification: Classification): string | null {
    if (classification.kind !== 'limit' || !isModelLimit(classification.message)) return null
    return weeklyLimitLiftsAt(repo.listRunOutcomesByAgent(this.db, agentId))
  }

  /**
   * Take a task that cannot run yet out of the queue, until the moment it can.
   *
   * A retry after a limit is not a task that lost its turn - every candidate it has is cooling down,
   * and nothing it does before they come back can succeed. Left queued it is claimed the instant a
   * cooldown lapses, takes the project's one slot, dies in seconds against an account that is still
   * out, and spends another of its attempts. Meanwhile the tasks behind it never move.
   *
   * A schedule a human set is never pulled earlier: they asked for "not before then", and the limit
   * only adds to that.
   */
  private parkUntilAgentReturns(taskId: string): void {
    // Re-read: the transition just wrote this task's session back, and which agents may continue it
    // is decided from that
    const task = repo.getTask(this.db, taskId)
    const project = task ? repo.getProject(this.db, task.projectId) : null
    if (!task || !project) return
    const until = cooldownClearsAt(this.db, project, {
      preferredAgentId: task.agentOverrideId,
      continuation: this.continuationFor(task)
    })
    if (until === null) return
    repo.setTaskSchedule(this.db, task.id,
      task.scheduledAt !== null && task.scheduledAt > until ? task.scheduledAt : until)
  }

  private shouldAutoRetry(kind: RunErrorKind, task: Task, project: Project, run: Run): boolean {
    const failures = consecutiveFailures(repo.listRunsByTask(this.db, task.id))
    // Do not resolve candidates once the limit is hit: resolving also advances the round-robin position.
    const requirement = retryRequirement(kind, failures)
    if (requirement === 'never') return false
    const usable = hasAnyUsableCandidate(this.db, project)
    // Look for another candidate only for failures that cannot be retried on the same one.
    return shouldRetryRun(kind, failures, usable,
      requirement === 'other-agent' && usable && this.hasOtherCandidate(task, project, run.agentId))
  }

  private hasOtherCandidate(task: Task, project: Project, currentAgentId: string): boolean {
    // A retried resume goes back to whoever opened it. A bare resolve here would decide "another
    // candidate exists" and hand it to someone who does not hold that session
    const resolved = resolveAgentForProject(this.db, project, {
      continuation: this.continuationFor(task)
    })
    if (resolved.ok) return resolved.value.agent.id !== currentAgentId
    // Only full right now; another candidate may become usable once its cooldown ends or its lane frees
    return resolved.reason === 'all-cooling' || resolved.reason === 'all-busy' ||
      resolved.reason === 'fallback-full'
  }

  private afterTransition(): void {
    afterCommit(this.db, () => {
      if (this.stopped) return
      this.emit('changed')
      this.emitStatus()
      // A slot just freed up, so go claim the next one immediately
      if (this.nextTick) clearTimeout(this.nextTick)
      this.nextTick = setTimeout(() => { this.nextTick = null; void this.tick() }, 50)
    })
  }

  // -------------------------------------------------------------------------
  // Manual run
  // -------------------------------------------------------------------------

  /** "Run now". Launches immediately, ignoring queue order. Returns the reason when no slot is free. */
  async runNow(taskId: string): Promise<{ ok: boolean; reason?: string }> {
    const prepared = inTransaction(this.db, () => {
      const task = repo.getTask(this.db, taskId)
      if (!task) return { ok: false, reason: t('tasks.notFound') }
      if (task.status === 'running') return { ok: false, reason: t('scheduler.alreadyRunning') }

      const project = repo.getProject(this.db, task.projectId)
      if (!project) return { ok: false, reason: t('tasks.projectNotFound') }
      if (!project.enabled) return { ok: false, reason: t('scheduler.projectDisabled') }

      // Even a manual run does not break another task's reservation (a human decided that too).
      // The reserving side is not blocked by it (same rule as claimNext).
      const others = holdsSlot(task.priority) ? [] : repo.listSlotReservations(this.db)
      const continuation = this.continuationFor(task)
      const resolved = resolveAgentForProject(this.db, project, {
        preferredAgentId: task.agentOverrideId,
        reserved: reservedByAgent(others),
        continuation
      })
      if (!resolved.ok) {
        return {
          ok: false,
          reason: this.resolveFailureLabel(project, resolved.reason, others, continuation)
        }
      }

      const params: StartParams = {
        task,
        project,
        agent: resolved.value.agent,
        groupId: resolved.value.groupId,
        kind: this.kindFor(task),
        messageOverride: this.messageFor(task),
        sessionId: this.sessionIdFor(task),
        fallbackFromRunId: this.previousFailedRunId(taskId)
      }
      return { ok: true as const, params, run: this.runner.prepare(params) }
    })
    if (!prepared.params) return prepared
    await this.runner.start(prepared.params, prepared.run)
    this.emit('changed')
    this.emitStatus()
    return { ok: true }
  }

  // -------------------------------------------------------------------------
  // Status
  // -------------------------------------------------------------------------

  status(): SchedulerStatus {
    // The scheduler never launches built-in definitions. Counting them as slots would line the
    // monitor strip with slots nobody can use
    const agents = repo.listAgents(this.db).filter((a) => !isManagedAgent(a))
    const cooldowns = new Map(repo.listCooldowns(this.db).map((c) => [c.agentId, c]))
    const reservations = repo.listSlotReservations(this.db)
    const reserved = reservedByAgent(reservations)
    // A lane kept open for an agent that falls back here is a slot that will not be handed out
    // either. Left out, the strip shows free slots the scheduler refuses to use - a stall with no reason
    const lanes = fallbackHolds(this.db)

    const slots: AgentSlotStatus[] = agents.map((a) => {
      const cd = cooldowns.get(a.id)
      const active = repo.countActiveRunsByAgent(this.db, a.id)
      return {
        agentId: a.id,
        agentName: a.name,
        concurrency: a.concurrency,
        active,
        // Together with the running slots, never exceed the concurrency (the visible slot count does not grow)
        reserved: Math.min(
          (reserved.get(a.id) ?? 0) + (lanes.get(a.id) ?? 0),
          Math.max(0, a.concurrency - active)
        ),
        cooldownUntil: cd?.until ?? null,
        cooldownReason: cd?.reason ?? '',
        enabled: a.enabled
      }
    })

    const holds: SlotHold[] = reservations.map((r) => ({
      taskId: r.taskId,
      taskTitle: r.title,
      projectName: repo.getProject(this.db, r.projectId)?.name ?? '—',
      agentName: r.agentId ? (repo.getAgent(this.db, r.agentId)?.name ?? null) : null
    }))

    const warnings: string[] = [...this.ruleWarnings]
    for (const slot of slots) {
      if (slot.cooldownUntil) {
        warnings.push(t('scheduler.cooldownUntil', { agent: slot.agentName, time: formatTime(slot.cooldownUntil) }))
      }
    }
    if (!this.enabled) warnings.push(t('scheduler.paused'))

    const queued = repo.countTasksByStatus(this.db, 'queued')
    if (queued > 0 && this.enabled && warnings.length === 0) {
      // Only give a reason when something is queued yet nothing is moving
      const active = repo.countActiveRuns(this.db)
      const total = slots.filter((s) => s.enabled).reduce((sum, s) => sum + s.concurrency, 0)
      if (active === 0 && total > 0) {
        for (const reason of this.blockReasons.values()) warnings.push(reason)
      }
    }

    // What waiting will not resolve is shown even while other things run. Buried in the queue, it is never found
    const stuck = [...this.stuckReasons.values()]
    warnings.push(...stuck.slice(0, STUCK_WARNING_LIMIT))
    if (stuck.length > STUCK_WARNING_LIMIT) {
      warnings.push(t('scheduler.moreStuck', { count: stuck.length - STUCK_WARNING_LIMIT }))
    }

    // A held task does not move until a human re-queues it. The moment the queue empties is exactly
    // that moment, so this one is named outright (kept quiet, it stays held and forgotten).
    if (this.enabled && queued === 0 && repo.countActiveRuns(this.db) === 0) {
      const held = repo.countTasksByStatus(this.db, 'held')
      if (held > 0) warnings.push(t('scheduler.queueEmptyHeld', { count: held }))
    }

    return {
      running: this.enabled,
      activeRuns: repo.countActiveRuns(this.db),
      totalSlots: slots.filter((s) => s.enabled).reduce((sum, s) => sum + s.concurrency, 0),
      queued,
      review: repo.countTasksByStatus(this.db, 'review'),
      failed: repo.countTasksByStatus(this.db, 'failed'),
      agents: slots,
      holds,
      warnings,
      lastTickAt: this.lastTickAt
    }
  }

  private emitStatus(): void {
    const status = this.status()
    // The tick time is bookkeeping no screen shows. Without it an idle scheduler reads the
    // same every tick, and repeating an unchanged status would only make windows redraw.
    const reading = JSON.stringify({ ...status, lastTickAt: null })
    if (reading === this.announced) return
    this.announced = reading
    this.emit('status', status)
  }

  private notify(
    level: ToastPayload['level'],
    message: string,
    taskId?: string,
    detail?: string
  ): void {
    afterCommit(this.db, () => this.emit('notify', { id: newId('tst'), level, message, taskId, detail }))
  }
}

/** Turn reservations into a count per agent ID. Fed to the resolver's availability check. */
function reservedByAgent(reservations: repo.SlotReservation[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const r of reservations) {
    if (!r.agentId) continue
    map.set(r.agentId, (map.get(r.agentId) ?? 0) + 1)
  }
  return map
}

/** Name the task holding the slot. Adds a count when there is more than one. */
function holdLabel(reservations: repo.SlotReservation[]): string {
  const first = reservations[0]
  if (!first) return t('scheduler.anotherTask')
  return reservations.length > 1
    ? t('scheduler.holderNameMore', { title: truncate(first.title, 24), count: reservations.length - 1 })
    : t('scheduler.holderName', { title: truncate(first.title, 24) })
}

/**
 * A clock time, with the date in front once the wait runs past today.
 *
 * A limit that lifts tomorrow evening read as "19:13" is the same words as one that lifts in twenty
 * minutes, and the whole point of the warning is telling those two apart.
 */
function formatTime(iso: string, now = new Date()): string {
  const d = new Date(iso)
  const clock = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (d.toDateString() === now.toDateString()) return clock
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${clock}`
}
