import type { Agent } from '../../../preload/api/agents.js'
import type { Run } from '../../../preload/api/execution.js'
import type { Project } from '../../../preload/api/projects.js'
import type { SessionMessage } from '../../../preload/api/session.js'
import type { AppSnapshot } from '../../../preload/api/snapshot.js'
import type { Task } from '../../../preload/api/tasks.js'
import { isManagedAgent } from './agentVisibility.js'
import { t } from './i18n/index.js'
import { RUN_ERROR_KIND_LABEL } from './labels.js'
import type { StatusGroup } from './statusGroups.js'
import { dependencyCleared, orderTasks, wouldCycle } from './taskOrdering.js'


/**
 * Task ordering. The UI uses the same rule as the scheduler's pickup condition
 * (`orderTasks`): follow-ups go first, blockers appear before their dependents.
 * So we never create "I specified it but the order didn't change".
 */
export function sortTasks(tasks: Task[], projects: Map<string, Project>): Task[] {
  return orderTasks(tasks, (projectId) => projects.get(projectId)?.priority ?? 99)
}

/**
 * Position within the queue (1-based).
 * Computed with the same rule as queuePositions on the main side, scheduled tasks left out:
 * one waiting for a time (a human's schedule, an agent's Limit) is not in line for the next slot.
 */
export function queuePositions(
  tasks: Task[],
  projects: Map<string, Project>,
  now = Date.now()
): Map<string, number> {
  const queued = sortTasks(
    tasks.filter(
      (t) =>
        t.status === 'queued' &&
        !t.archived &&
        (t.scheduledAt === null || Date.parse(t.scheduledAt) <= now)
    ),
    projects
  )
  const map = new Map<string, number>()
  queued.forEach((t, i) => map.set(t.id, i + 1))
  return map
}

export function projectMap(projects: Project[]): Map<string, Project> {
  return new Map(projects.map((p) => [p.id, p]))
}

export function latestRunMap(runs: Run[]): Map<string, Run> {
  const map = new Map<string, Run>()
  for (const run of runs) {
    const existing = map.get(run.taskId)
    if (!existing || run.startedAt > existing.startedAt) map.set(run.taskId, run)
  }
  return map
}

/** View wording and grouping. Owned by the Mac display model. */
export { groupByStatus, STATUS_ORDER, type StatusGroup } from './statusGroups.js'

export type TaskGroup = StatusGroup<Task>

export interface ScopeFilter {
  kind: 'all' | 'review' | 'project'
  projectId?: string
  showDone: boolean
}

/**
 * The scope a section refers to. The set **before search and filtering**, and
 * the denominator for counts. Without "12 filtered, of 240" you end up hunting
 * for the rows that disappeared.
 */
export function scopeTasks(snapshot: AppSnapshot, filter: ScopeFilter): Task[] {
  const tasks = snapshot.tasks.filter((t) => !t.archived)

  if (filter.kind === 'review') {
    return tasks.filter((t) => t.status === 'review' || t.status === 'failed')
  }
  return tasks.filter(
    (t) =>
      (filter.kind !== 'project' || t.projectId === filter.projectId) &&
      (filter.showDone || t.status !== 'done')
  )
}

export function filterTasks(snapshot: AppSnapshot, filter: ScopeFilter): Task[] {
  const projects = projectMap(snapshot.projects)
  return sortTasks(scopeTasks(snapshot, filter), projects)
}

/** Open-task count per project. Used for the rail badges. */
export function openCountByProject(tasks: Task[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const task of tasks) {
    if (task.archived || task.status === 'done') continue
    map.set(task.projectId, (map.get(task.projectId) ?? 0) + 1)
  }
  return map
}

export function reviewCount(tasks: Task[]): number {
  return tasks.filter((t) => !t.archived && (t.status === 'review' || t.status === 'failed')).length
}

/** Display name of the agent / group the project uses. */
export function targetLabel(snapshot: AppSnapshot, project: Project | undefined): string {
  if (!project || !project.targetId) return t('derive.unassigned')
  if (project.targetKind === 'agent') {
    return snapshot.agents.find((a) => a.id === project.targetId)?.name ?? t('derive.deleted')
  }
  return snapshot.groups.find((g) => g.id === project.targetId)?.name ?? t('derive.deleted')
}

/**
 * The execution target the task actually uses.
 *
 * The task's override (`agentOverrideId`) coming before the project assignment
 * is the same order as `resolveAgentForProject` on the main side. If the list
 * column showed only the project assignment, **an override would look like it
 * wasn't applied**.
 *
 * Returns one of four shapes: `agent:<id>` / `group:<id>` / `external:<adapter>` / `none`.
 * Also used as the filter value, so external sessions are bundled per CLI
 * (without "show only Codex (external)", every import collapses into one lump).
 */
export function taskTargetKey(task: Task, project: Project | undefined): string {
  if (task.agentOverrideId) return `agent:${task.agentOverrideId}`
  const external = task.externalKey?.split(':', 1)[0]
  if (external) return `external:${external}`
  if (!project?.targetId) return 'none'
  return `${project.targetKind}:${project.targetId}`
}

/** Display name of the execution target. Task override first (same order as `taskTargetKey`). */
export function taskTargetLabel(
  snapshot: AppSnapshot,
  task: Task,
  project: Project | undefined
): string {
  if (task.agentOverrideId) {
    return snapshot.agents.find((a) => a.id === task.agentOverrideId)?.name ?? t('derive.deleted')
  }
  /*
   * An imported task **itself knows who ran it**.
   *
   * Looking at the project assignment yields "unassigned": projects created by
   * import carry no execution target (deliberately empty, so the scheduler
   * never launches on its own in an external project).
   * But the column should answer "what ran this", and that part is known.
   */
  const external = task.externalKey?.split(':', 1)[0]
  if (external) return snapshot.externalAgentNames?.[external] ?? external
  return targetLabel(snapshot, project)
}

/**
 * Identifier used by the list's "agent" column.
 *
 * With a Run, returns the agent actually resolved for that Run rather than the
 * configured assignment (groups included). Only tasks never assigned yet fall
 * back to the execution target they would use next.
 */
export function taskAgentKey(
  task: Task,
  project: Project | undefined,
  latestRun: Run | undefined
): string {
  return latestRun ? `agent:${latestRun.agentId}` : taskTargetKey(task, project)
}

/** Name shown in the list's "agent" column (same precedence as `taskAgentKey`). */
export function taskAgentLabel(
  snapshot: AppSnapshot,
  task: Task,
  project: Project | undefined,
  latestRun: Run | undefined
): string {
  if (latestRun) {
    return snapshot.agents.find((agent) => agent.id === latestRun.agentId)?.name ?? t('derive.deleted')
  }
  return taskTargetLabel(snapshot, task, project)
}

export type ProjectIssueKind = 'disabled' | 'no-target' | 'target-missing' | 'no-usable-agent'

export interface ProjectIssue {
  kind: ProjectIssueKind
  message: string
}

/**
 * Agents reachable from the execution target (same rule as `candidateAgents`
 * on the main side). Fallbacks are part of the resolution order, not "something
 * to look for after failing", so the runnability check includes the chain too.
 */
function candidateAgentIds(snapshot: AppSnapshot, project: Project): string[] {
  if (!project.targetId) return []
  const byId = new Map(snapshot.agents.map((a) => [a.id, a]))
  const out: string[] = []
  const seen = new Set<string>()

  const push = (id: string | null | undefined): void => {
    if (!id || seen.has(id) || !byId.has(id)) return
    seen.add(id)
    out.push(id)
  }

  const pushWithFallbacks = (id: string | null): void => {
    push(id)
    let cursor = id ? (byId.get(id)?.fallbackAgentId ?? null) : null
    const visited = new Set<string>(id ? [id] : [])
    while (cursor && !visited.has(cursor)) {
      visited.add(cursor)
      const agent = byId.get(cursor)
      if (!agent) break
      push(agent.id)
      cursor = agent.fallbackAgentId
    }
  }

  if (project.targetKind === 'agent') {
    pushWithFallbacks(project.targetId)
    return out
  }

  const group = snapshot.groups.find((g) => g.id === project.targetId)
  if (!group) return out
  const members = group.memberIds.filter((id) => byId.get(id)?.enabled)
  members.forEach((id) => push(id))
  members.forEach((id) => pushWithFallbacks(id))
  return out
}

/**
 * The parts of this project's settings that **block execution until fixed**.
 *
 * The check walks the same conditions as main's `resolveAgentForProject`, but
 * picks up only what can't be resolved without a settings change. Full slots
 * (all-busy) and cooldowns (all-cooling) resolve by waiting, so they don't
 * appear here. The point of this function: know whether a change is needed
 * before opening the settings.
 *
 * The wording states only **what is missing** (rule Q). The fix belongs to the
 * adjacent "open project settings", so no "please do X" sentences.
 */
export function projectIssues(
  snapshot: AppSnapshot,
  project: Project,
  overrideAgentId: string | null = null
): ProjectIssue[] {
  const issues: ProjectIssue[] = []

  if (!project.enabled) {
    issues.push({
      kind: 'disabled',
      message: t('derive.issue.disabled')
    })
  }

  const preferred = overrideAgentId
    ? (snapshot.agents.find((a) => a.id === overrideAgentId) ?? null)
    : null

  if (!project.targetId && !preferred) {
    issues.push({
      kind: 'no-target',
      message: t('derive.issue.noTarget')
    })
    return issues
  }

  if (project.targetId) {
    const target =
      project.targetKind === 'agent'
        ? snapshot.agents.find((a) => a.id === project.targetId)
        : snapshot.groups.find((g) => g.id === project.targetId)
    if (!target && !preferred) {
      issues.push({
        kind: 'target-missing',
        message: t('derive.issue.targetMissing')
      })
      return issues
    }
  }

  const byId = new Map(snapshot.agents.map((a) => [a.id, a]))
  const usable = candidateAgentIds(snapshot, project).some((id) => byId.get(id)?.enabled)
  if (!usable && !preferred?.enabled) {
    issues.push({
      kind: 'no-usable-agent',
      message: t('derive.issue.noUsableAgent')
    })
  }

  return issues
}

/**
 * The agents the project itself points at: the single agent it names, or its group's members.
 *
 * Only what the project chose. Fallback chains are reachable too, but nobody picked them for
 * this project, so they belong with the rest rather than with the project's own.
 */
export function projectAgentIds(snapshot: AppSnapshot, project: Project | undefined): string[] {
  if (!project?.targetId) return []
  if (project.targetKind === 'agent') return [project.targetId]
  return snapshot.groups.find((g) => g.id === project.targetId)?.memberIds ?? []
}

/**
 * Candidates for the composer's agent picker.
 * The project assignment (single agent / group members) goes first,
 * followed by the remaining enabled agents.
 */
export function candidateAgentsFor(
  snapshot: AppSnapshot,
  project: Project | undefined,
  overrideId: string | null
): Agent[] {
  const byId = new Map(snapshot.agents.map((a) => [a.id, a]))
  const ordered: Agent[] = []
  const seen = new Set<string>()

  const push = (agent: Agent | undefined): void => {
    // Never offer the behind-the-scenes definitions. Disabled, so they are
    // never used to run — but merely appearing among candidates makes them look choosable
    if (!agent || seen.has(agent.id) || isManagedAgent(agent)) return
    seen.add(agent.id)
    ordered.push(agent)
  }

  projectAgentIds(snapshot, project).forEach((id) => push(byId.get(id)))
  if (overrideId) push(byId.get(overrideId))
  snapshot.agents.filter((a) => a.enabled).forEach(push)

  return ordered
}

/** Blockers not yet satisfied (same rule as unsatisfiedBlockers on the main side). */
export function blockingTasks(task: Task, byId: Map<string, Task>): Task[] {
  const blockers: Task[] = []
  for (const dep of task.dependsOn) {
    if (dep.taskId === task.id) continue
    const blocker = byId.get(dep.taskId)
    if (!blocker) continue
    if (!dependencyCleared(blocker, dep.mode)) blockers.push(blocker)
  }
  return blockers
}

/** Whether every blocker condition is satisfied. */
export function dependencySatisfied(task: Task, byId: Map<string, Task>): boolean {
  return blockingTasks(task, byId).length === 0
}

/**
 * Whether adding this candidate as a blocker would create a cycle.
 * The main side does the final rejection, but not offering beats
 * being scolded after choosing.
 */
export function wouldCycleWith(task: Task, candidateId: string, byId: Map<string, Task>): boolean {
  const edges = new Map(
    [...byId.values()].map((t) => [t.id, t.dependsOn.map((d) => d.taskId)] as const)
  )
  return wouldCycle(edges, task.id, [candidateId])
}

export function taskMap(tasks: Task[]): Map<string, Task> {
  return new Map(tasks.map((t) => [t.id, t]))
}

/** What goes to the agent on the next run. Returned with where to edit it (which field). */
export interface NextSend {
  /** The field to edit: the follow-up, or the prompt re-sent as a first run */
  field: 'pendingMessage' | 'prompt'
  value: string
}

/**
 * What will be sent on the next run.
 *
 * A follow-up (send-back / continuation from chat) if there is one, otherwise
 * the prompt re-sent as a first run. **Returns nothing while running** — it has
 * already been handed over, and showing it here would blur it with "not yet sent".
 *
 * Instructions of a task that never ran are also returned here, to keep them in
 * **the same shape, place, and operations** (edit / cancel) as the post-run
 * "waiting to run". Placed elsewhere as a read-only quote, editability stops
 * being readable from the form.
 */
export function nextSend(task: Task, hasRuns: boolean, delivered: string[] = []): NextSend | null {
  if (task.status === 'running') return null
  if (task.pendingMessage.trim().length > 0) {
    /*
     * A resume that died before answering still handed its instruction over — the conversation
     * above already shows it. Calling it "not yet sent" underneath puts the same message on
     * screen twice, and the run that picks this up will not send it a second time either.
     */
    const rest = undelivered(task.pendingMessage, delivered)
    return rest.length > 0 ? { field: 'pendingMessage', value: rest } : null
  }
  if (!hasRuns) {
    return task.prompt.trim().length > 0 ? { field: 'prompt', value: task.prompt } : null
  }
  if (task.status === 'queued' || task.status === 'failed') {
    return { field: 'prompt', value: task.prompt }
  }
  return null
}

/**
 * What the agent is already holding out of the instruction that waits to be sent.
 *
 * A CLI writes an instruction into its session the moment it accepts a resume, so a run that
 * ended without answering still delivered it. Only such a run counts: after one that finished,
 * anything waiting here was written afterwards.
 *
 * The same reading is made on the main side (`session/delivery.ts`) to decide what the next run
 * actually sends. This one only decides what to draw, from the conversation already on screen.
 */
export function deliveredInstructions(
  messages: SessionMessage[],
  runs: Run[],
  sessionId: string | null
): string[] {
  // The whole stretch of attempts that never got an answer, newest first in the list
  let unanswered: Run | undefined
  for (const run of runs) {
    if (run.status === 'succeeded' || run.sessionId !== sessionId) break
    unanswered = run
  }
  if (!unanswered) return []
  const said: string[] = []
  for (const message of writtenBy(messages, unanswered)) {
    if (message.role !== 'user' || message.isSidechain) continue
    const text = messageText(message)
    if (text.length > 0) said.push(text)
  }
  return said
}

/**
 * The stretch of a conversation one run wrote.
 *
 * The clock answers this wherever a CLI records one. Cursor and Grok record none - every message
 * they keep comes back with a null timestamp - so a cut by time hands back nothing and the run
 * reads as if it had written not a word. On screen that showed as the instruction standing twice:
 * the copy Quuu holds while the log catches up never gave way to the one the CLI had already
 * written.
 *
 * Without a clock the instruction itself is the marker. A CLI writes what it was resumed with as
 * a user turn the moment it accepts the resume, so the conversation from that copy on is what
 * this run put there. An older turn of the same wording can be picked instead when this run never
 * got as far as writing its own, which leaves the one copy on screen the human already wrote.
 *
 * The same reading decides what the next run sends, on the main side (`main/session/delivery.ts`).
 */
export function writtenBy(
  messages: SessionMessage[],
  run: Pick<Run, 'startedAt' | 'promptPreview'>
): SessionMessage[] {
  if (messages.some((message) => message.timestamp !== null)) {
    const started = Date.parse(run.startedAt)
    if (Number.isNaN(started)) return []
    // Some logs keep only whole seconds, so what was written in the starting second still counts
    const from = Math.floor(started / 1000) * 1000
    return messages.filter(
      (message) => message.timestamp !== null && Date.parse(message.timestamp) >= from
    )
  }
  const handed = run.promptPreview.trim()
  if (handed.length === 0) return []
  const anchor = messages.findLastIndex(
    (message) =>
      message.role === 'user' && !message.isSidechain && messageText(message).includes(handed)
  )
  return anchor === -1 ? [] : messages.slice(anchor)
}

function messageText(message: SessionMessage): string {
  return message.blocks
    .map((block) => (block.kind === 'text' ? block.text : ''))
    .filter((part) => part.length > 0)
    .join('\n\n')
    .trim()
}

/** How many messages back a sentence still counts as "the conversation just said that". */
const RECENT = 3

/**
 * What the failure box says under its heading.
 *
 * The reason is dropped once the conversation itself carries it: Claude Code writes
 * "You've reached your limit" into the session as the agent's own turn, so printing the same
 * sentence in a box right underneath is that sentence twice. What the box still adds there is
 * the reading of it — that this ended the run, and how.
 */
export function failureReason(run: Run | undefined, messages: SessionMessage[]): string {
  const kind = run?.errorKind ? RUN_ERROR_KIND_LABEL[run.errorKind] : ''
  const message = run?.errorMessage.trim() ?? ''
  if (message.length === 0) return kind || t('chat.noFailureReason')
  return alreadySaid(messages, message) ? kind || t('chat.noFailureReason') : message
}

function alreadySaid(messages: SessionMessage[], text: string): boolean {
  const needle = collapse(text)
  if (needle.length === 0) return false
  return messages
    .slice(-RECENT)
    .some((message) => !message.isSidechain && collapse(messageText(message)).includes(needle))
}

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * What is left of an instruction once the parts already handed over are taken off the front.
 *
 * Follow-ups written one after another are joined in writing order, so what was delivered is
 * always the front of what waits. Anything that does not match is left whole.
 */
export function undelivered(message: string, delivered: string[]): string {
  let rest = message.trim()
  for (const text of delivered) {
    const sent = text.trim()
    if (sent.length > 0 && rest.startsWith(sent)) rest = rest.slice(sent.length).trim()
  }
  return rest
}

/**
 * Default project to enqueue into. The list's one-line input and the bottom
 * composer go through the same rule.
 *
 * On a project screen the hierarchy already decided. Otherwise the **explicitly
 * picked destination** comes first, then **the project of the currently open
 * task**, and failing both, fall to the first project.
 *
 * The pick outranks the guess because enqueueing repeatedly into the same place
 * is a real usage. Reversed, the destination would reset every time you switch
 * screens or open a task, forcing a re-pick per enqueue. Only while nothing is
 * picked do we lean on the open task (adding while reading details is usually a
 * continuation of the current work, which removes the picking step).
 */
export function defaultTargetProjectId(
  sectionProjectId: string | null,
  pickedProjectId: string | null,
  openTaskProjectId: string | null,
  projects: Project[]
): string | null {
  const has = (id: string | null): boolean => id !== null && projects.some((p) => p.id === id)
  if (has(sectionProjectId)) return sectionProjectId
  if (has(pickedProjectId)) return pickedProjectId
  if (has(openTaskProjectId)) return openTaskProjectId
  return projects[0]?.id ?? null
}
