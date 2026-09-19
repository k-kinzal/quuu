import type { Agent } from '../agents/types.js'
import { orderAgents } from '../agents/types.js'
import type { Db } from '../db/database.js'
import * as repo from '../db/repo.js'
import type { AppSettings } from '../settings/types.js'

/** Why nobody writes the report. `none` is "nobody is set", `cooling` is "not right now". */
export type WriterProblem = 'none' | 'cooling'

export type ChosenWriter =
  | { ok: true; agent: Agent; groupId: string | null }
  | { ok: false; reason: WriterProblem }

/**
 * Who writes the report.
 *
 * A name and a group answer two different questions. A name says *this one*; a group says
 * **whoever can take it** — which is what choosing a writer is really for, since the agents
 * doing the work are busy and a report is the job to hand to whichever one is free. So a group
 * is read through its own strategy, exactly as a project's runs are.
 *
 * **No slot is taken either way.** A report must never make the queue wait
 * (`ReportOperations`), so a busy member is still a candidate; how loaded members are only
 * decides the order they are tried in. A cooldown is different: a member waiting out a limit
 * would take the job and die on arrival, so it is passed over — and when it is a single agent
 * that is waiting, the honest answer is "not right now" rather than a run that cannot work.
 */
export function chooseWriter(db: Db, settings: AppSettings): ChosenWriter {
  const candidates = writerCandidates(db, settings)
  if (candidates.length === 0) return { ok: false, reason: 'none' }
  const agent = candidates.find((a) => !repo.isCoolingDown(db, a.id))
  if (!agent) return { ok: false, reason: 'cooling' }
  return {
    ok: true,
    agent,
    groupId: settings.reportTargetKind === 'group' ? settings.reportTargetId : null
  }
}

/**
 * The writers that may be tried, in order. Empty when the setting names nobody usable.
 *
 * "Enabled" is the one switch that says a definition may be launched at all, so a disabled
 * agent drops out here — otherwise that switch would mean different things in two places.
 */
function writerCandidates(db: Db, settings: AppSettings): Agent[] {
  if (settings.reportTargetId.length === 0) return []
  if (settings.reportTargetKind === 'agent') {
    const agent = repo.getAgent(db, settings.reportTargetId)
    return agent?.enabled ? [agent] : []
  }

  const group = repo.getGroup(db, settings.reportTargetId)
  if (!group) return []
  const members = group.memberIds
    .map((id) => repo.getAgent(db, id))
    .filter((a): a is Agent => a !== null)
  // `orderAgents` drops the disabled ones and owns what each strategy means
  return orderAgents(
    group.strategy,
    members,
    new Map(members.map((a) => [a.id, repo.countActiveRunsByAgent(db, a.id)])),
    repo.groupRotation(db, group.id)
  )
}
