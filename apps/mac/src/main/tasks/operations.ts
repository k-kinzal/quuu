import type { Agent } from '../agents/types.js'
import type { Db } from '../db/database.js'
import { afterCommit, inTransaction } from '../db/database.js'
import * as repo from '../db/repo.js'
import type { SessionOwner } from '../execution/agentResolver.js'
import { eligibleAgents, sessionOwner, sessionOwnerLabel } from '../execution/agentResolver.js'
import type { Run } from '../execution/types.js'
import { t } from '../i18n/index.js'
import type { RunNowResult } from '../ipc/types.js'
import type { Project } from '../projects/types.js'
import { attachSessionLog } from '../session/sessionAttach.js'
import type { ToastPayload } from '../snapshot.js'
import { newId, nowIso, truncate } from '../util.js'
import { assertCreation, assertEditable, assertHoldable, assertTaskExists, normalizeSchedule } from './conditions.js'
import type { Task, TaskInput, TaskPatch } from './types.js'

export class TaskOperations {
  constructor(private db: Db, private changed: () => void, private wake: () => void, private run: (id: string) => Promise<RunNowResult>, private cancel: (id: string) => void, private notify: (toast: ToastPayload) => void) {
    this.changed = () => afterCommit(db, changed)
    this.wake = () => afterCommit(db, wake)
    this.notify = (toast) => afterCommit(db, () => notify(toast))
  }


  // -------------------------------------------------------------------------
  // Tasks
  // -------------------------------------------------------------------------

  /** The external API reads the same source as the UI, including archived only when asked. */
  listTasks(includeArchived = false): Task[] {
    return repo.listTasks(this.db, includeArchived)
  }


  getTask(id: string): Task | null {
    return repo.getTask(this.db, id)
  }


  /**
   * Create a task.
   *
   * `id` can be passed for creations arriving from the iPhone. Unless the
   * device-assigned id is used as-is, the same intent arriving twice creates two tasks.
   */
  createTask(raw: TaskInput, id?: string): Task {
    return inTransaction(this.db, () => {
      const input = normalizeSchedule(raw)
      assertCreation(input)
      const task = id ? repo.insertTask(this.db, input, id) : repo.insertTask(this.db, input)
      this.changed()
      if (task.status === 'queued') this.wake()
      return task

    })
  }


  updateTask(id: string, raw: TaskPatch): Task {
    return inTransaction(this.db, () => {
      const patch = normalizeSchedule(raw)
      if (
        patch.dependsOn !== undefined &&
        repo.wouldCycle(
          this.db,
          id,
          patch.dependsOn.map((d) => d.taskId)
        )
      ) {
        throw new Error(t('tasks.dependencyCycle'))
      }
      const before = assertTaskExists(repo.getTask(this.db, id), id)
      assertEditable(before, patch)
      const task = repo.patchTask(this.db, id, patch)
      this.changed()
      // Leaving P0 lets go of the slot it was keeping; entering P0 puts it at the front of the
      // queue. Either way the scheduler's picture just changed, so it looks now, not next tick
      if (task.priority !== before.priority) this.wake()
      return task

    })
  }


  enqueueTask(id: string): Task {
    return inTransaction(this.db, () => {
      const task = repo.setTaskStatus(this.db, id, 'queued')
      this.changed()
      this.wake()
      return task

    })
  }


  unqueueTask(id: string): Task {
    return inTransaction(this.db, () => {
      const task = repo.setTaskStatus(this.db, id, 'draft')
      this.changed()
      return task

    })
  }


  /**
   * Hold. Removes from the queue but does not return to draft.
   *
   * Putting "I don't want it to run right now for ordering reasons, but the
   * instruction is already written" in the same place as drafts makes it
   * indistinguishable from half-written work. The scheduler only fetches
   * `queued`, so moving it here is enough to take it out of execution.
   */
  holdTask(id: string): Task {
    return inTransaction(this.db, () => {
      const current = repo.getTask(this.db, id)
      if (!current) throw new Error(`task not found: ${id}`)
      // Stopping something that is running is cancel's job (runner.cancel).
      // Rewriting only the status here drifts the display away from the running process.
      assertHoldable(current)
      const task = repo.setTaskStatus(this.db, id, 'held')
      this.changed()
      return task

    })
  }


  /**
   * "Run now". An explicit run instruction from a human.
   *
   * If the task holds a session that can't be continued, fold it up here before
   * running. On a conversation known to be un-continuable, the only meaning this
   * action can have is "run fresh". Refuse, and you get a task where pressing
   * the button does nothing.
   */
  async runNow(id: string): Promise<RunNowResult> {
    const task = repo.getTask(this.db, id)
    const project = task ? repo.getProject(this.db, task.projectId) : null
    if (task && project && task.status !== 'running') this.detachDeadSession(task, project)

    const result = await this.run(id)
    this.changed()
    return result
  }


  /** Done. Only humans pass through here. */
  markDone(id: string): Task {
    return inTransaction(this.db, () => {
      const task = repo.setTaskStatus(this.db, id, 'done', {
        pendingMessage: '',
        doneAt: nowIso()
      })
      this.changed()
      // Completion also frees any reserved slot. Get whatever was waiting moving right away
      this.wake()
      return task

    })
  }



  reopen(id: string): Task {
    return inTransaction(this.db, () => {
      const task = repo.setTaskStatus(this.db, id, 'review', { doneAt: null })
      this.changed()
      return task

    })
  }


  /** Send back. Stacks a follow-up message and re-queues. */
  sendBack(id: string, note: string): Task {
    return inTransaction(this.db, () => {
      const message = note.trim()
      const current = repo.getTask(this.db, id)
      if (!current) throw new Error(`task not found: ${id}`)

      // If the session can't be continued, there is nothing to send back to. Fold into the prompt and run fresh
      const project = repo.getProject(this.db, current.projectId)
      const detached = project ? this.detachDeadSession(current, project, message) : null
      if (!detached && message.length > 0) repo.setPendingMessage(this.db, id, message)

      const task = repo.setTaskStatus(this.db, id, 'queued')
      this.changed()
      this.wake()
      return task

    })
  }


  cancelTask(id: string): Task {
    return inTransaction(this.db, () => {
      const task = repo.getTask(this.db, id)
      if (!task) throw new Error(`task not found: ${id}`)
      const active = repo
        .listRunsByTask(this.db, id)
        .filter((r) => r.status === 'running' || r.status === 'starting')
      for (const run of active) this.cancel(run.id)
      if (active.length === 0 && task.status === 'running') {
        repo.setTaskStatus(this.db, id, 'draft')
      }
      this.changed()
      return repo.getTask(this.db, id)!

    })
  }


  deleteTask(id: string): void {
    return inTransaction(this.db, () => {
      const active = repo
        .listRunsByTask(this.db, id)
        .filter((r) => r.status === 'running' || r.status === 'starting')
      for (const run of active) this.cancel(run.id)
      // repo.deleteTask drops dependencies of waiting tasks in both directions (nothing stays stuck)
      repo.deleteTask(this.db, id)
      this.changed()
      this.wake()

    })
  }


  archiveTask(id: string, archived: boolean): Task {
    return inTransaction(this.db, () => {
      const task = repo.setTaskArchived(this.db, id, archived)
      this.changed()
      return task

    })
  }


  /**
   * Sending from the composer. The primary act on a task converges into this one entry.
   *
   * - Running: held as a **reservation**. Sent as a continued run the moment the run ends normally
   *   → the urge to say the next thing comes while reading, so don't make the human remember it until the run ends
   * - No session yet (= never ran): this text becomes the prompt and the task is queued
   *   → enables the deferred usage of "queue just a title first, open it later and write the instruction"
   * - Session exists: stacked as a follow-up for a continued run (send back)
   */
  send(taskId: string, message: string): RunNowResult {
    return inTransaction(this.db, () => {
      const text = message.trim()

      const task = repo.getTask(this.db, taskId)
      if (!task) return { ok: false, reason: t('tasks.notFound') }

      const project = repo.getProject(this.db, task.projectId)
      if (!project) return { ok: false, reason: t('tasks.projectNotFound') }

      if (task.status === 'running') {
        if (text.length === 0) return { ok: false, reason: t('tasks.emptyMessage') }
        const owner = this.ownerOf(task)
        if (!this.continuableAgent(task, project, owner)) {
          return { ok: false, reason: this.resumeUnavailable(owner) }
        }
        // Write as many messages mid-run as you like. They are held merged into one, in writing order.
        repo.setReservedMessage(this.db, taskId, joinMessages(task.reservedMessage, text))
        this.changed()
        return { ok: true, reserved: true }
      }

      // Stopped. If a reservation is being held, carry it along with this send (leave nothing behind).
      const body = joinMessages(task.reservedMessage, text)
      if (body.length === 0) return { ok: false, reason: t('tasks.emptyMessage') }

      // A session that can't be continued gets folded here into an instruction for a new session.
      // Refuse, and the composer's "re-run" / "send back" become buttons that do nothing when pressed
      const detached = this.detachDeadSession(task, project, body)
      if (detached) {
        if (task.reservedMessage.length > 0) repo.setReservedMessage(this.db, taskId, '')
        repo.setTaskStatus(this.db, taskId, 'queued')
        this.changed()
        this.wake()
        return { ok: true }
      }

      // Re-attaching may have aligned the session with reality, so re-read before dispatching
      const fresh = repo.getTask(this.db, taskId) ?? task
      if (fresh.sessionId) {
        // If an unsent follow-up remains, chain onto it. Overwriting would silently
        // drop the first of two messages written while queued (the prompt side concatenates).
        repo.setPendingMessage(this.db, taskId, joinMessages(fresh.pendingMessage, body))
      } else {
        repo.patchTask(this.db, taskId, { prompt: joinMessages(fresh.prompt, body) })
      }
      if (task.reservedMessage.length > 0) repo.setReservedMessage(this.db, taskId, '')

      repo.setTaskStatus(this.db, taskId, 'queued')
      this.changed()
      this.wake()
      return { ok: true }

    })
  }


  /** Canceling a reservation. Deciding not to send is a human act too, so it gets an explicit entry. */
  /** A late-arriving follow-up also lands in the same reservation field, merged with the current content. */
  reserveMessage(taskId: string, message: string): Task {
    return inTransaction(this.db, () => {
      const task = assertTaskExists(repo.getTask(this.db, taskId), taskId)
      const result = repo.setReservedMessage(this.db, taskId, joinMessages(task.reservedMessage, message))
      this.changed()
      return result
    })
  }

  clearReservation(taskId: string): Task {
    return inTransaction(this.db, () => {
      const task = repo.setReservedMessage(this.db, taskId, '')
      this.changed()
      return task

    })
  }


  /**
   * Who opened the session. **Re-attach to reality before reading.**
   *
   * A CLI that picks its own ID can finish with a nonexistent, Quuu-assigned ID
   * still on record. The re-pickup works during the run and at exit, but
   * **never applied to Runs that ran before that mechanism existed**.
   * Before judging continuability, align with reality once. If it aligns, even
   * an old task continues as-is without being folded up.
   */
  private ownerOf(task: Task): SessionOwner {
    for (const run of repo.listRunsByTask(this.db, task.id)) {
      if (run.sessionId === task.sessionId) attachSessionLog(this.db, run)
    }
    return sessionOwner(this.db, repo.getTask(this.db, task.id) ?? task)
  }


  /**
   * The agent that can write this task's continuation. null if there is none.
   *
   * The judgment goes through the same rules as `resolveAgentForProject`'s
   * continuation filter, including compatible configured fallbacks during cooldown.
   * A different rule only here means
   * "it sent but never runs" (or the reverse).
   */
  private continuableAgent(task: Task, project: Project, owner: SessionOwner): Agent | null {
    const eligible = eligibleAgents(this.db, project, {
      preferredAgentId: task.agentOverrideId,
      continuation: owner
    })
    return eligible.ok ? eligible.value[0] ?? null : null
  }


  /**
   * Fold up a session that can't be continued, into a form that runs in a new session. true if folded.
   *
   * This throws away a conversation, so **only pass when a human ordered the run**.
   * The scheduler's automatic pickup never passes. The agent that opened it may
   * merely be temporarily disabled — re-enable it and the continuation runs.
   * Discarding a conversation nobody asked to discard does more harm than making them wait.
   *
   * The follow-up and the text just written are **folded into the prompt, not
   * discarded**. The new session has none of the old conversation, so everything
   * is needed, original instruction included.
   *
   * Never do it silently. The screen shows the conversation changed, but **why**
   * it changed can only be said here.
   */
  private detachDeadSession(current: Task, project: Project, extra = ''): boolean {
    if (!current.sessionId) return false
    const owner = this.ownerOf(current)
    // Re-attaching can move the task's session ID, so re-read before judging
    const task = repo.getTask(this.db, current.id) ?? current
    if (!task.sessionId) return false
    if (this.continuableAgent(task, project, owner)) return false

    repo.patchTask(this.db, task.id, {
      prompt: joinMessages(task.prompt, task.pendingMessage, extra)
    })
    repo.clearTaskSession(this.db, task.id)
    this.notify({
      id: newId('toast'),
      level: 'warn',
      message: t('tasks.newSessionToast', { title: truncate(task.title, 50) }),
      detail: t('tasks.newSessionDetail', { reason: this.resumeUnavailable(owner) }),
      taskId: task.id
    } satisfies ToastPayload)
    return true
  }


  /**
   * Why the continuation can't be sent. **Say only what is missing** (convention Q).
   *
   * What's missing is "the agent that opened the session", not continuable agents
   * in general. Disabled / dropped from candidates / empty resume args — whichever
   * it is, that agent is where the fix goes, so name it.
   */
  private resumeUnavailable(owner: SessionOwner): string {
    const label = sessionOwnerLabel(this.db, owner)
    return label.length > 0
      ? t('tasks.sessionOwnerUnavailable', { owner: label })
      : t('tasks.noContinuableSession')
  }


  // -------------------------------------------------------------------------
  // Runs / sessions
  // -------------------------------------------------------------------------

  runsByTask(taskId: string): Run[] {
    return repo.listRunsByTask(this.db, taskId)
  }


  cancelRun(runId: string): void {
    this.cancel(runId)
    this.changed()
  }
}
function joinMessages(...parts: string[]): string {
  return parts
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .join('\n\n')
}
