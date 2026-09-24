import type { Agent, GroupStrategy } from '../agents/types.js'
import { mayContinueSession, orderAgents } from '../agents/types.js'
import type { Project } from '../projects/types.js'
import type { Task } from '../tasks/types.js'
import type { SlotAvailability } from './conditions.js'
import type { Run } from './types.js'
import { slotAvailability } from './conditions.js'

import { cliLabel, sameCli } from '../agents/cli.js'
import type { Db } from '../db/database.js'
import * as repo from '../db/repo.js'
import { t } from '../i18n/index.js'

export type ResolveFailure =
  | 'no-target'
  | 'target-missing'
  | 'no-usable-agent'
  | 'pick-unavailable'
  | 'other-cli'
  | 'no-continuable-agent'
  | 'all-busy'
  | 'all-cooling'
  | 'all-reserved'
  | 'fallback-full'

// The wording has to be looked up after the language is initialized, so it resolves on call rather than in a table
export function resolveFailureMessage(reason: ResolveFailure): string {
  return t(`resolveFailure.${reason}`)
}

/**
 * Who a follow-up continues with: the agent that opened that session.
 *
 * Holds both the agent definition (`agentId`) and the command actually invoked at the time
 * (`command`). A definition can be rewritten later, so even with the same `agentId`, if the
 * command has been swapped for a different CLI that session is no longer readable.
 *
 * Both empty means **the owner is unknown**. What is unknown cannot be continued
 * (handing over a session ID nobody claims finds no conversation on the CLI side).
 */
export interface SessionOwner {
  agentId: string
  command: string
}

/**
 * The side that opened that task's session.
 *
 * What is examined is **the run that opened the session, not the latest one**. If a run that
 * failed trying to continue with a different agent is the latest, an implementation that treats
 * the latest as the owner learns that mistake and repeats it forever after.
 *
 * The opener is the initial run (`initial`). A follow-up inherits the session ID, but an initial
 * run always mints a new one, so there is exactly one initial run with a given ID.
 * Not "oldest first" or anything time-based, because that does not settle a tie in the same millisecond.
 */
export function sessionOwner(db: Db, task: Task): SessionOwner {
  const sessionId = task.sessionId?.trim() ?? ''
  if (sessionId.length === 0) return { agentId: '', command: '' }

  const sameSession = repo.listRunsByTask(db, task.id).filter((r) => r.sessionId === sessionId)
  const opened = sameSession.filter((r) => r.kind === 'initial')
  // Only when no initial run survives (partial history) fall back to the oldest run
  const source = opened.length > 0 ? opened : sameSession
  const run = source[source.length - 1]
  return { agentId: run?.agentId ?? '', command: run?.command.trim() ?? '' }
}

/** The owner's name for display. Falls back to the CLI's name when the definition is gone. */
export function sessionOwnerLabel(db: Db, owner: SessionOwner): string {
  const agent = owner.agentId ? repo.getAgent(db, owner.agentId) : null
  return agent?.name ?? cliLabel(owner.command)
}

/**
 * Is there a conversation under this task's session?
 *
 * A session ID alone proves nothing: every launch mints one before the CLI has said a word, and a
 * run that died at spawn leaves the ID behind with nothing under it. Resuming that ID fails the
 * same way as resuming another CLI's. The proof is a run on that ID that **finished normally**
 * (the CLI ran to its end and wrote the exchange down) or whose **log was found** (the CLI wrote
 * one, however the run ended).
 */
export function hasConversation(db: Db, task: Task): boolean {
  const sessionId = task.sessionId?.trim() ?? ''
  if (sessionId.length === 0) return false
  return repo.listRunsByTask(db, task.id)
    .some((r) => r.sessionId === sessionId && (r.status === 'succeeded' || r.sessionLogPath !== null))
}

/**
 * Can the next run pick the conversation up where it was left: is there one, and can the agent
 * that opened it still read it (same CLI, resume arguments configured)?
 *
 * This, not the presence of a follow-up, decides whether the next run resumes. A task whose
 * follow-up was discarded still holds its conversation; treating it as a first run because the
 * text box is empty is how a Codex task got handed to Claude as a fresh session (it happened).
 * Only what cannot be resumed at all opens a new session, and that stays on the task's CLI.
 */
export function canResumeConversation(db: Db, task: Task): boolean {
  if (!hasConversation(db, task)) return false
  const owner = sessionOwner(db, task)
  const agent = owner.agentId ? repo.getAgent(db, owner.agentId) : null
  return agent !== null && canReadSession(agent, owner)
}

/**
 * A run the CLI turned away at a limit, or that never became a process, has read nothing of the
 * task and settles nothing about it. Every other run reached the CLI, whatever came of it.
 */
function reachedTheCli(run: Pick<Run, 'status' | 'errorKind'>): boolean {
  return run.status !== 'limited' && run.errorKind !== 'spawn'
}

/**
 * The CLI this task belongs to: the one that opened the session it holds, or failing that the
 * one that last actually ran it.
 *
 * **A task never changes CLI.** A Codex conversation cannot be read by `claude`, and even a
 * fresh session on another CLI throws away everything the first one learned. The session owner
 * is the authority while the session is held and a run reached the CLI under it; once the session
 * has been let go of (a fold into a new one), the run history still says which CLI the work
 * happened on. Both empty means no CLI has read this task yet - it has never run, or every attempt
 * was turned away unread - and any CLI may take it.
 */
export function taskLineage(db: Db, task: Task): SessionOwner {
  const reached = repo.listRunsByTask(db, task.id).filter(reachedTheCli)
  const owner = sessionOwner(db, task)
  if (owner.command.length > 0 && reached.some((r) => r.sessionId === task.sessionId)) return owner
  const last = reached.find((r) => r.command.trim().length > 0)
  return last ? { agentId: last.agentId, command: last.command.trim() } : { agentId: '', command: '' }
}

/** May this agent take a run of a task with that lineage at all? Unknown lineage binds nobody. */
export function sameLineage(agent: Agent, lineage: SessionOwner | null | undefined): boolean {
  return !lineage || lineage.command.length === 0 || sameCli(agent.command, lineage.command)
}

/**
 * Can that agent **read** this session?
 *
 * Where a conversation lives and how to resume it differ per CLI. `claude --resume <a Codex
 * session ID>` does not hold up and dies with "No conversation found with session ID".
 * Empty resume arguments count the same (no initial arguments either, so the CLI comes up interactive).
 *
 * This is the **floor**; whether it may be delegated automatically is decided by `canContinueSession`.
 */
export function canReadSession(agent: Agent, owner: SessionOwner): boolean {
  if (agent.resumeArgsTemplate.length === 0) return false
  return sameCli(agent.command, owner.command)
}

/**
 * May this agent continue without a switch? A free slot never changes the model by itself.
 * Explicit task choices and compatible fallbacks during cooldown are resolved by `eligibleAgents`.
 */
export function canContinueSession(agent: Agent, owner: SessionOwner): boolean {
  return mayContinueSession(agent.id, owner.agentId, canReadSession(agent, owner))
}

export interface ResolvedAgent {
  agent: Agent
  groupId: string | null
}

export type ResolveResult =
  | { ok: true; value: ResolvedAgent }
  | { ok: false; reason: ResolveFailure }

/**
 * List the candidate agents for a project's run target, in order.
 *
 * Order:
 *   single target -> [the named agent, ...its fallback chain]
 *   group         -> [members in the strategy's order..., each member's fallback chain...]
 *
 * Treating fallbacks as part of the resolution order rather than as something to look for after a
 * failure is what lets a limit cooldown fall through to the next candidate without human help.
 */
export function candidateAgents(db: Db, project: Project): Agent[] {
  if (!project.targetId) return []
  const seen = new Set<string>()
  const out: Agent[] = []

  const push = (agent: Agent | null): void => {
    if (!agent || seen.has(agent.id)) return
    seen.add(agent.id)
    out.push(agent)
  }

  const pushWithFallbacks = (agent: Agent | null): void => {
    push(agent)
    if (!agent) return
    for (const next of fallbackChain(db, agent.id)) push(next)
  }

  if (project.targetKind === 'agent') {
    pushWithFallbacks(repo.getAgent(db, project.targetId))
    return out
  }

  const group = repo.getGroup(db, project.targetId)
  if (!group) return out

  const members = group.memberIds
    .map((id) => repo.getAgent(db, id))
    .filter((a): a is Agent => a !== null)

  const ordered = orderByStrategy(db, group.id, group.strategy, members)
  ordered.forEach((m) => push(m))
  ordered.forEach((m) => {
    for (const next of fallbackChain(db, m.id)) push(next)
  })
  return out
}

function orderByStrategy(db: Db, groupId: string, strategy: GroupStrategy, members: Agent[]): Agent[] {
  // "Least busy" means least of the capacity spoken for, lanes included - ranking by runs alone
  // would put a member first whose slots are already promised to someone else's fallback
  const holds = strategy === 'least-busy' ? fallbackHolds(db) : new Map<string, number>()
  const active = new Map(strategy === 'least-busy'
    ? members.filter((agent) => agent.enabled)
      .map((agent) => [agent.id, repo.countActiveRunsByAgent(db, agent.id) + (holds.get(agent.id) ?? 0)])
    : [])
  return orderAgents(strategy, members, active,
    strategy === 'round-robin' ? repo.groupRotation(db, groupId) : null)
}

export interface ResolveOptions {
  /**
   * A per-task agent choice ("just this one on Codex" from the composer).
   *
   * **A choice is binding, not a preference.** The candidates are that agent and its own fallback
   * chain; the project's target never stands in for it. A busy pick is waited for. Handing the
   * run to a free group member instead is how a task set to Codex opened on Claude, and the
   * lineage then kept it there for good (it happened).
   */
  preferredAgentId?: string | null
  /** Slots reserved by other tasks (agent ID -> count). */
  reserved?: ReadonlyMap<string, number>
  /**
   * On a follow-up, the owner of the session being continued.
   *
   * Narrows to the opener or explicit task choice, plus their compatible fallbacks during
   * cooldown. Not given on an initial run (a new session is minted).
   */
  continuation?: SessionOwner | null
  /**
   * The CLI the task belongs to (`taskLineage`), on every run of a task that has run before.
   *
   * Narrows every candidate - the target, the explicit task choice, every fallback - to that
   * CLI, before continuation is even considered. A fresh session on another CLI is still a
   * switch, and a switch is never automatic: not for a free slot, not for a cooldown, not for a
   * failure that asks for another agent.
   */
  lineage?: SessionOwner | null
  /**
   * Start even while every candidate is cooling down.
   *
   * A Limit can be lifted from outside Quuu — a plan change, credits bought — and the only way
   * to learn that is to try. Automatic claims still wait the cooldown out. A human's "run now"
   * does not: this one run is allowed through, and a Limit on the way out puts the task back to waiting.
   */
  ignoreCooldown?: boolean
}

/**
 * The agent a task was set to run on, when that choice can be honored at all.
 *
 * A pick that crosses the task's CLI cannot be honored: a task never changes CLI, so the task
 * stays with whoever its history names and the pick is set aside (`cliPin.test.ts`). A pick whose
 * definition is gone is set aside the same way; deleting an agent clears the picks that named it,
 * so this is only a stale row.
 */
export function pickedAgent(db: Db, options: Pick<ResolveOptions, 'preferredAgentId' | 'lineage'>): Agent | null {
  const preferred = options.preferredAgentId ? repo.getAgent(db, options.preferredAgentId) : null
  return preferred && sameLineage(preferred, options.lineage) ? preferred : null
}

/**
 * Who this task is allowed to run on at all, in resolution order - before any slot or cooldown is
 * looked at. Shared by "who takes it now" and "when could anyone take it", so the two can never
 * disagree about who was in the running.
 *
 * A picked agent replaces the project's target outright: the field is the pick and its own
 * fallback chain, nothing else. Without a pick, the field is the project's target and its
 * fallbacks. Either way, only agents of the task's CLI remain.
 */
export function eligibleAgents(
  db: Db,
  project: Project,
  options: ResolveOptions
): { ok: true; value: Agent[] } | { ok: false; reason: ResolveFailure } {
  const { continuation, lineage } = options
  const picked = pickedAgent(db, options)

  let usable: Agent[]
  if (picked) {
    // The pick's own configured fallbacks are the human's choice too; the project's are not
    usable = [picked, ...fallbackChain(db, picked.id)].filter((a) => a.enabled && sameLineage(a, lineage))
    if (usable.length === 0) return { ok: false, reason: 'pick-unavailable' }
  } else {
    if (!project.targetId) return { ok: false, reason: 'no-target' }
    const target =
      project.targetKind === 'agent'
        ? repo.getAgent(db, project.targetId)
        : repo.getGroup(db, project.targetId)
    if (!target) return { ok: false, reason: 'target-missing' }

    const enabledAgents = candidateAgents(db, project).filter((a) => a.enabled)
    if (enabledAgents.length === 0) return { ok: false, reason: 'no-usable-agent' }
    // The CLI is settled by the task's history, and nothing chosen afterwards - a group member
    // with a free slot, an explicit pick of another CLI - gets to unsettle it
    usable = enabledAgents.filter((a) => sameLineage(a, lineage))
    if (usable.length === 0) return { ok: false, reason: 'other-cli' }
  }

  // A configured fallback is an explicit choice too. Expand only during cooldown: a busy
  // opener still waits for its slot, and unrelated group members never inherit its session.
  const roots = continuation
    ? usable.filter((a) =>
      a.id === picked?.id
        ? canReadSession(a, continuation)
        : canContinueSession(a, continuation)
    )
    : usable
  const candidates = continuation
    ? [...new Map(roots.flatMap((agent) => [
      agent,
      ...(repo.isCoolingDown(db, agent.id) ? fallbackLane(db, agent.id, continuation) : [])
    ]).map((agent) => [agent.id, agent])).values()]
    : roots
  if (candidates.length === 0) return { ok: false, reason: 'no-continuable-agent' }
  return { ok: true, value: candidates }
}

/**
 * Pick one candidate that can start right now. As a side effect, advances the round-robin position.
 *
 * `preferredAgentId`, when given, is the whole field (with its own fallbacks). A pick with no
 * slot is waited for; it is never traded for a free agent the human did not choose.
 *
 * `reserved` counts as occupied even when nothing is running, so a follow-up on a task that
 * reserved its slot is not dragged into the queue.
 *
 * When `continuation` is given, **the candidates are narrowed before slots are even looked at**.
 * A free slot alone never changes models; a cooldown can use a configured compatible fallback.
 *
 * A candidate that could still fall back needs a free slot **on every agent in its lane** as well
 * as one of its own (`fallbackHolds`).
 */
export function resolveAgentForProject(
  db: Db,
  project: Project,
  options: ResolveOptions = {}
): ResolveResult {
  const { reserved, continuation, lineage } = options
  const picked = pickedAgent(db, options)

  const eligible = eligibleAgents(db, project, options)
  if (!eligible.ok) return eligible
  const candidates = eligible.value

  const holds = fallbackHolds(db)
  const availabilityOf = (agent: Agent): SlotAvailability =>
    slotAvailability(
      repo.countActiveRunsByAgent(db, agent.id) + (holds.get(agent.id) ?? 0),
      reserved?.get(agent.id) ?? 0,
      agent.concurrency
    )

  let sawCooling = false
  let sawReserved = false
  let sawFallbackFull = false
  for (const agent of candidates) {
    if (!options.ignoreCooldown && repo.isCoolingDown(db, agent.id)) {
      sawCooling = true
      continue
    }
    const availability = availabilityOf(agent)
    if (availability === 'busy') continue
    if (availability === 'reserved') {
      // Without the reservation it would have been free. That is a different reason from busy, so it is reported separately
      sawReserved = true
      continue
    }
    /*
     * Starting here promises the same slot on the way out. A run launched without one is a run
     * whose fallback exists on paper only, and a cooldown that cannot be escaped is exactly what
     * the fallback was configured to avoid. A continuation reserves only compatible fallbacks.
     */
    if (fallbackLane(db, agent.id, continuation, lineage).some((next) => availabilityOf(next) !== 'available')) {
      sawFallbackFull = true
      continue
    }

    // A run on a picked agent (or its fallback) was not the group's decision, so it is not recorded as one
    const groupId =
      project.targetKind === 'group' && !picked ? project.targetId : null
    if (groupId) repo.advanceGroupRotation(db, groupId, agent.id)
    return { ok: true, value: { agent, groupId } }
  }

  // Named ahead of a full slot: a candidate that is itself free reads as a stall with no reason
  if (sawFallbackFull) return { ok: false, reason: 'fallback-full' }
  if (sawReserved) return { ok: false, reason: 'all-reserved' }
  return { ok: false, reason: sawCooling ? 'all-cooling' : 'all-busy' }
}

/**
 * The earliest moment one of this task's candidates stops being cooled down. null when waiting is
 * not what stands in the way - either one of them is already free of cooldowns, or there is nobody.
 *
 * Only cooldowns are read. A busy slot frees when the run on it ends, which no clock can predict,
 * so the task stays in the queue for it; **a cooldown has a stated end**, and a task that can do
 * nothing until then is better out of the queue than taking the project's slot to die in seconds.
 */
export function cooldownClearsAt(
  db: Db,
  project: Project,
  options: ResolveOptions = {}
): string | null {
  const eligible = eligibleAgents(db, project, options)
  if (!eligible.ok) return null

  let earliest: string | null = null
  for (const agent of eligible.value) {
    const until = repo.cooldownEnd(db, agent.id)
    if (until === null) return null
    if (earliest === null || until < earliest) earliest = until
  }
  return earliest
}

/**
 * The agents a run could still be handed to if this one gives out.
 *
 * Disabled definitions drop out: a fallback that can never be chosen is not a lane worth keeping
 * open, and the chain continues past it to the one that can. A fallback on another CLI drops out
 * the same way: the task can never move there, so its slot is not one this run is waiting on.
 */
export function fallbackLane(
  db: Db,
  agentId: string,
  continuation?: SessionOwner | null,
  lineage?: SessionOwner | null
): Agent[] {
  return fallbackChain(db, agentId).filter((a) =>
    a.enabled && sameLineage(a, lineage) && (!continuation || canReadSession(a, continuation)))
}

/**
 * Slots that are free but already spoken for (agent ID -> count): every active run books one on
 * each agent it could still fall back to.
 *
 * **A fallback costs what the original costs.** A Limit is account-wide, so the moment the primary
 * hits one, *every* run on it has to move at once. Counting a run only against the agent it runs on
 * lets the primary and its fallback hand out the same capacity twice, and by the time the move is
 * needed the other side is full: either the fallback cannot happen at all, or it starts on top of
 * slots someone else is using and the account's usage is spent at twice the rate that was
 * configured. Neither is worth the extra parallelism, so a run holds its way out for as long as it
 * runs.
 *
 * Follow-ups hold only the configured fallbacks that can read their existing session.
 */
export function fallbackHolds(db: Db): Map<string, number> {
  const holds = new Map<string, number>()
  for (const run of repo.listActiveRuns(db)) {
    const owner = { agentId: run.agentId, command: run.command }
    const continuation = run.kind === 'followup' ? owner : null
    // Whatever kind it is, the run has settled the task's CLI: only lanes on that CLI are held
    for (const target of fallbackLane(db, run.agentId, continuation, owner)) {
      holds.set(target.id, (holds.get(target.id) ?? 0) + 1)
    }
  }
  return holds
}

/** Walk the fallback chain. A reference cycle is cut off by the visited set. */
export function fallbackChain(db: Db, startAgentId: string): Agent[] {
  const chain: Agent[] = []
  const visited = new Set<string>([startAgentId])
  let cursor = repo.getAgent(db, startAgentId)?.fallbackAgentId ?? null

  while (cursor && !visited.has(cursor)) {
    visited.add(cursor)
    const agent = repo.getAgent(db, cursor)
    if (!agent) break
    chain.push(agent)
    cursor = agent.fallbackAgentId
  }
  return chain
}

/**
 * Does that project have a candidate that could eventually run?
 * Used to tell "not right now but it will move if you wait" apart from "it will never move".
 */
export function hasAnyUsableCandidate(db: Db, project: Project): boolean {
  return candidateAgents(db, project).some((a) => a.enabled)
}
