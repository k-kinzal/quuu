import type { Agent, GroupStrategy } from '../agents/types.js'
import { mayContinueSession, orderAgents } from '../agents/types.js'
import type { Project } from '../projects/types.js'
import type { Task } from '../tasks/types.js'
import type { SlotAvailability } from './conditions.js'
import { slotAvailability } from './conditions.js'

import { cliLabel, sameCli } from '../agents/cli.js'
import type { Db } from '../db/database.js'
import * as repo from '../db/repo.js'
import { t } from '../i18n/index.js'

export type ResolveFailure =
  | 'no-target'
  | 'target-missing'
  | 'no-usable-agent'
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
  /** A per-task agent choice ("just this one on Sonnet" from the composer). */
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
}

/**
 * Who this task is allowed to run on at all, in resolution order - before any slot or cooldown is
 * looked at. Shared by "who takes it now" and "when could anyone take it", so the two can never
 * disagree about who was in the running.
 */
export function eligibleAgents(
  db: Db,
  project: Project,
  options: ResolveOptions
): { ok: true; value: Agent[] } | { ok: false; reason: ResolveFailure } {
  const { preferredAgentId, continuation } = options
  const preferred = preferredAgentId ? repo.getAgent(db, preferredAgentId) : null

  if (!project.targetId && !preferred) return { ok: false, reason: 'no-target' }

  if (project.targetId) {
    const target =
      project.targetKind === 'agent'
        ? repo.getAgent(db, project.targetId)
        : repo.getGroup(db, project.targetId)
    if (!target && !preferred) return { ok: false, reason: 'target-missing' }
  }

  const base = candidateAgents(db, project).filter((a) => a.enabled)
  const preferredChain = preferred
    ? [preferred, ...fallbackChain(db, preferred.id)].filter((a) => a.enabled)
    : []
  const preferredIds = new Set(preferredChain.map((a) => a.id))
  const usable = [...preferredChain, ...base.filter((a) => !preferredIds.has(a.id))]
  if (usable.length === 0) return { ok: false, reason: 'no-usable-agent' }

  // A configured fallback is an explicit choice too. Expand only during cooldown: a busy
  // opener still waits for its slot, and unrelated group members never inherit its session.
  const roots = continuation
    ? usable.filter((a) =>
      a.id === preferred?.id
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
 * `preferredAgentId`, when given, becomes the top candidate, but falls back to normal resolution
 * if it has no slot or is cooling down.
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
  const { preferredAgentId, reserved, continuation } = options
  const preferred = preferredAgentId ? repo.getAgent(db, preferredAgentId) : null

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
    if (repo.isCoolingDown(db, agent.id)) {
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
    if (fallbackLane(db, agent.id, continuation).some((next) => availabilityOf(next) !== 'available')) {
      sawFallbackFull = true
      continue
    }

    const groupId =
      project.targetKind === 'group' && agent.id !== preferred?.id ? project.targetId : null
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
 * open, and the chain continues past it to the one that can.
 */
export function fallbackLane(db: Db, agentId: string, continuation?: SessionOwner | null): Agent[] {
  return fallbackChain(db, agentId).filter((a) => a.enabled && (!continuation || canReadSession(a, continuation)))
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
    const continuation = run.kind === 'followup' ? { agentId: run.agentId, command: run.command } : null
    for (const target of fallbackLane(db, run.agentId, continuation)) {
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
