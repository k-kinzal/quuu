import type { LogAdapter } from '../agents/cliAdapter.js'
import type { Agent, AgentCooldown, AgentGroup, AgentGroupInput, AgentInput, GroupStrategy } from '../agents/types.js'
import type { TaskRule, TaskRuleInput } from '../automation/conditions.js'
import type { Run, RunErrorKind, RunKind, RunOutcome } from '../execution/types.js'
import type { Project, ProjectInput, RunTargetKind } from '../projects/types.js'
import type { CommitIdentityMode } from '../settings/identity.js'
import type { AppSettings } from '../settings/types.js'
import { DEFAULT_SETTINGS } from '../settings/types.js'
import { dependencyCleared, orderTasks, wouldCycle as wouldCycleIn } from '../tasks/ordering.js'
import type { DependsMode, Priority, RecordSource, RunStatus, TaskStatus } from '../tasks/status.js'
import { ACTIVE_RUN_STATUSES, HOLDING_PRIORITY } from '../tasks/status.js'
import type { Task, TaskDependency, TaskInput, TaskPatch } from '../tasks/types.js'

import type { SyncOutcome, SyncReceipt } from '../mobile-sync/protocol.js'
import type { SessionMessage } from '../session/types.js'
import type { ReportStatus, StoredReport } from '../report/types.js'
import type { ReviewSnapshot } from '../review/types.js'
import { b2i, i2b, newId, nowIso, parseJson } from '../util.js'
import type { Db } from './database.js'

type Row = Record<string, unknown>

export interface SessionIndexRecord {
  stamp: string
  generation: string
  title: string | null
  total: number
  evidenceVersion: number
}

export function getSessionIndex(db: Db, key: string): SessionIndexRecord | null {
  const row = db.prepare('SELECT * FROM session_indexes WHERE log_key = ?').get(key) as Row | undefined
  return row ? { stamp: s(row.stamp), generation: s(row.generation), title: sn(row.title), total: n(row.total), evidenceVersion: n(row.evidence_version) } : null
}

export function writeSessionMessages(db: Db, key: string, generation: string, start: number, messages: SessionMessage[]): void {
  const insert = db.prepare('INSERT OR REPLACE INTO session_messages (log_key, generation, ordinal, message) VALUES (?, ?, ?, ?)')
  messages.forEach((message, i) => insert.run(key, generation, start + i, JSON.stringify(message)))
}

export function readSessionMessages(db: Db, key: string, generation: string, start: number, limit: number): SessionMessage[] {
  return (db.prepare('SELECT message FROM session_messages WHERE log_key = ? AND generation = ? AND ordinal >= ? ORDER BY ordinal LIMIT ?')
    .all(key, generation, start, limit) as Row[]).map(row => JSON.parse(s(row.message)) as SessionMessage)
}

export function finishSessionIndex(db: Db, key: string, record: SessionIndexRecord): void {
  db.prepare('INSERT OR REPLACE INTO session_indexes (log_key, stamp, generation, title, total, evidence_version) VALUES (?, ?, ?, ?, ?, ?)')
    .run(key, record.stamp, record.generation, record.title, record.total, record.evidenceVersion)
  db.prepare('DELETE FROM session_messages WHERE log_key = ? AND (generation <> ? OR ordinal >= ?)').run(key, record.generation, record.total)
}

export function finishSessionEvidence(db: Db, key: string, version: number): void {
  db.prepare('UPDATE session_indexes SET evidence_version = ? WHERE log_key = ?').run(version, key)
}

export function writeSessionImage(db: Db, key: string, id: string, dataUrl: string): void {
  db.prepare('INSERT OR IGNORE INTO session_images (id, log_key, data_url) VALUES (?, ?, ?)').run(id, key, dataUrl)
}

export function readSessionImage(db: Db, key: string, id: string): string | null {
  const row = db.prepare('SELECT data_url FROM session_images WHERE log_key = ? AND id = ?').get(key, id) as Row | undefined
  return row ? s(row.data_url) : null
}

export function recordReviewEvidence(db: Db, taskId: string, kind: 'commit' | 'pull-request', value: string): void {
  db.prepare('INSERT OR IGNORE INTO task_review_evidence (task_id, kind, value) VALUES (?, ?, ?)').run(taskId, kind, value)
}

export function reviewEvidence(db: Db, taskId: string): { commits: string[]; pullRequests: string[] } {
  const rows = db.prepare('SELECT kind, value FROM task_review_evidence WHERE task_id = ?').all(taskId) as Row[]
  return { commits: rows.filter(row => row.kind === 'commit').map(row => s(row.value)), pullRequests: rows.filter(row => row.kind === 'pull-request').map(row => s(row.value)) }
}

export function getReviewSnapshot(db: Db, taskId: string): { updatedAt: string; snapshot: ReviewSnapshot } | null {
  const row = db.prepare('SELECT * FROM task_review_snapshots WHERE task_id = ?').get(taskId) as Row | undefined
  return row ? { updatedAt: s(row.updated_at), snapshot: JSON.parse(s(row.snapshot)) as ReviewSnapshot } : null
}

export function saveReviewSnapshot(db: Db, taskId: string, snapshot: ReviewSnapshot): void {
  db.prepare('INSERT OR REPLACE INTO task_review_snapshots (task_id, updated_at, snapshot) VALUES (?, ?, ?)')
    .run(taskId, nowIso(), JSON.stringify(snapshot))
}

// ---------------------------------------------------------------------------
// Change reports
// ---------------------------------------------------------------------------

function toReport(r: Row): StoredReport {
  return {
    taskId: s(r.task_id),
    status: s(r.status, 'generating') as ReportStatus,
    revision: s(r.revision),
    path: s(r.path),
    logPath: s(r.log_path),
    error: s(r.error),
    startedAt: s(r.started_at),
    endedAt: sn(r.ended_at),
    cwd: s(r.cwd),
    pid: r.pid === null || r.pid === undefined ? null : n(r.pid),
    pending: s(r.pending),
    exitPath: s(r.exit_path)
  }
}

export function getTaskReport(db: Db, taskId: string): StoredReport | null {
  const row = db.prepare('SELECT * FROM task_reports WHERE task_id = ?').get(taskId) as Row | undefined
  return row ? toReport(row) : null
}

/** The generations still to be settled. Read from storage, so a restart resumes where it left off. */
export function listGeneratingReports(db: Db): StoredReport[] {
  const rows = db.prepare("SELECT * FROM task_reports WHERE status = 'generating'").all() as Row[]
  return rows.map(toReport)
}

export function saveTaskReport(db: Db, report: StoredReport): void {
  db.prepare(
    `INSERT OR REPLACE INTO task_reports (task_id, status, revision, path, pending, log_path,
       exit_path, error, cwd, pid, started_at, ended_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    report.taskId,
    report.status,
    report.revision,
    report.path,
    report.pending,
    report.logPath,
    report.exitPath,
    report.error,
    report.cwd,
    report.pid,
    report.startedAt,
    report.endedAt
  )
}

export interface TaskReviewBase {
  taskId: string
  cwd: string
  startedAt: string
  baseHead: string | null
  baseTree: string | null
}

const s = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d)
const n = (v: unknown, d = 0): number => (typeof v === 'number' ? v : d)
const sn = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null)

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function toAgent(r: Row): Agent {
  return {
    id: s(r.id),
    name: s(r.name),
    description: s(r.description),
    command: s(r.command),
    argsTemplate: parseJson<string[]>(r.args_template, []),
    resumeArgsTemplate: parseJson<string[]>(r.resume_args_template, []),
    env: parseJson<Record<string, string>>(r.env, {}),
    concurrency: n(r.concurrency, 1),
    fallbackAgentId: sn(r.fallback_agent_id),
    limitPatterns: parseJson<string[]>(r.limit_patterns, []),
    cooldownSeconds: n(r.cooldown_seconds, 900),
    timeoutSeconds: n(r.timeout_seconds, 0),
    logAdapter: s(r.log_adapter, 'claude') as LogAdapter,
    enabled: i2b(r.enabled),
    source: s(r.source, 'user') as RecordSource,
    sortOrder: n(r.sort_order),
    createdAt: s(r.created_at),
    updatedAt: s(r.updated_at)
  }
}

function toProject(r: Row): Project {
  return {
    id: s(r.id),
    name: s(r.name),
    path: s(r.path),
    color: s(r.color, '#4EA8DE'),
    priority: n(r.priority, 2),
    targetKind: s(r.target_kind, 'agent') as RunTargetKind,
    targetId: sn(r.target_id),
    maxConcurrent: n(r.max_concurrent, 1),
    enabled: i2b(r.enabled),
    deletedAt: sn(r.deleted_at),
    importSince: sn(r.import_since),
    commitIdentityMode: s(r.commit_identity_mode, 'inherit') as CommitIdentityMode,
    commitIdentity: {
      appSlug: s(r.commit_app_slug),
      botUserId: s(r.commit_bot_user_id),
      appId: s(r.commit_app_id),
      setupVersion: n(r.commit_setup_version)
    },
    editorApp: s(r.editor_app),
    reportEnabled: i2b(r.report_enabled),
    source: s(r.source, 'user') as RecordSource,
    sortOrder: n(r.sort_order),
    createdAt: s(r.created_at),
    updatedAt: s(r.updated_at)
  }
}

function toTask(r: Row, dependsOn: TaskDependency[]): Task {
  return {
    id: s(r.id),
    projectId: s(r.project_id),
    title: s(r.title),
    prompt: s(r.prompt),
    status: s(r.status, 'draft') as TaskStatus,
    priority: n(r.priority, 2) as Priority,
    seq: n(r.seq),
    scheduledAt: sn(r.scheduled_at),
    currentRunId: sn(r.current_run_id),
    sessionId: sn(r.session_id),
    agentOverrideId: sn(r.agent_override_id),
    pendingMessage: s(r.pending_message),
    reservedMessage: s(r.reserved_message),
    reviewNote: s(r.review_note),
    dependsOn,
    source: s(r.source, 'user') as RecordSource,
    ruleId: sn(r.rule_id),
    externalKey: sn(r.external_key),
    archived: i2b(r.archived),
    createdAt: s(r.created_at),
    updatedAt: s(r.updated_at),
    doneAt: sn(r.done_at)
  }
}

function toRun(r: Row): Run {
  return {
    id: s(r.id),
    taskId: s(r.task_id),
    agentId: s(r.agent_id),
    resolvedFromGroupId: sn(r.resolved_from_group_id),
    sessionId: s(r.session_id),
    kind: s(r.kind, 'initial') as RunKind,
    status: s(r.status, 'starting') as RunStatus,
    attempt: n(r.attempt, 1),
    fallbackFromRunId: sn(r.fallback_from_run_id),
    pid: typeof r.pid === 'number' ? r.pid : null,
    cwd: s(r.cwd),
    command: s(r.command),
    args: parseJson<string[]>(r.args, []),
    promptPreview: s(r.prompt_preview),
    exitCode: typeof r.exit_code === 'number' ? r.exit_code : null,
    errorKind: (sn(r.error_kind) as RunErrorKind | null) ?? null,
    errorMessage: s(r.error_message),
    sessionLogPath: sn(r.session_log_path),
    stdoutLogPath: s(r.stdout_log_path),
    source: s(r.source, 'user') as RecordSource,
    externalKey: sn(r.external_key),
    startedAt: s(r.started_at),
    endedAt: sn(r.ended_at)
  }
}

const activePlaceholders = ACTIVE_RUN_STATUSES.map(() => '?').join(',')

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

export function listAgents(db: Db): Agent[] {
  return (db.prepare('SELECT * FROM agents ORDER BY sort_order, name').all() as Row[]).map(toAgent)
}

/**
 * A note the app leaves itself, alongside the schema version.
 *
 * Used for "has this already been done once" — a question that belongs to no row, and whose
 * answer must survive a restart (`seed.ts` remembers which definitions it has already offered).
 */
export function getMetaValue(db: Db, key: string): string | null {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as Row | undefined
  return row ? s(row.value) : null
}

export function setMetaValue(db: Db, key: string, value: string): void {
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?')
    .run(key, value, value)
}

export function getAgent(db: Db, id: string): Agent | null {
  const r = db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as Row | undefined
  return r ? toAgent(r) : null
}

export function insertAgent(db: Db, input: AgentInput, id = newId('agt')): Agent {
  const ts = nowIso()
  db.prepare(
    `INSERT INTO agents (id, name, description, command, args_template, resume_args_template, env,
       concurrency, fallback_agent_id, limit_patterns, cooldown_seconds, timeout_seconds,
       log_adapter, enabled, source, sort_order, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    id,
    input.name,
    input.description ?? '',
    input.command,
    JSON.stringify(input.argsTemplate ?? []),
    JSON.stringify(input.resumeArgsTemplate ?? []),
    JSON.stringify(input.env ?? {}),
    input.concurrency ?? 1,
    input.fallbackAgentId ?? null,
    JSON.stringify(input.limitPatterns ?? []),
    input.cooldownSeconds ?? 900,
    input.timeoutSeconds ?? 0,
    input.logAdapter ?? 'claude',
    b2i(input.enabled ?? true),
    input.source ?? 'user',
    input.sortOrder ?? 0,
    ts,
    ts
  )
  return getAgent(db, id)!
}

/**
 * Never update `source`. Ownership (user / Quuu) is settled when the record is created; letting
 * it be rewritten later would turn a user's own definition into a built-in one and hide it from view.
 */
export function updateAgent(db: Db, id: string, patch: Partial<AgentInput>): Agent {
  const cur = getAgent(db, id)
  if (!cur) throw new Error(`agent not found: ${id}`)
  // undefined in a partial update means "not specified". No entry point (GUI, CLI, sync) erases an existing value.
  const next = { ...cur, ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) }
  db.prepare(
    `UPDATE agents SET name=?, description=?, command=?, args_template=?, resume_args_template=?,
       env=?, concurrency=?, fallback_agent_id=?, limit_patterns=?, cooldown_seconds=?,
       timeout_seconds=?, log_adapter=?, enabled=?, sort_order=?, updated_at=?
     WHERE id=?`
  ).run(
    next.name,
    next.description,
    next.command,
    JSON.stringify(next.argsTemplate),
    JSON.stringify(next.resumeArgsTemplate),
    JSON.stringify(next.env),
    next.concurrency,
    next.fallbackAgentId ?? null,
    JSON.stringify(next.limitPatterns),
    next.cooldownSeconds,
    next.timeoutSeconds,
    next.logAdapter,
    b2i(next.enabled),
    next.sortOrder,
    nowIso(),
    id
  )
  return getAgent(db, id)!
}

export function deleteAgent(db: Db, id: string): void {
  db.prepare('UPDATE agents SET fallback_agent_id = NULL WHERE fallback_agent_id = ?').run(id)
  db.prepare('DELETE FROM agent_group_members WHERE agent_id = ?').run(id)
  db.prepare(
    "UPDATE projects SET target_id = NULL WHERE target_kind = 'agent' AND target_id = ?"
  ).run(id)
  db.prepare('UPDATE task_rules SET agent_override_id = NULL WHERE agent_override_id = ?').run(id)
  db.prepare('DELETE FROM agent_cooldowns WHERE agent_id = ?').run(id)
  db.prepare('DELETE FROM agents WHERE id = ?').run(id)
}

/** How many slots that agent is using right now. */
export function countActiveRunsByAgent(db: Db, agentId: string): number {
  const r = db
    .prepare(
      `SELECT COUNT(*) AS c FROM runs WHERE agent_id = ? AND status IN (${activePlaceholders})`
    )
    .get(agentId, ...ACTIVE_RUN_STATUSES) as Row
  return n(r.c)
}

/**
 * Active runs of one kind, counted per agent.
 *
 * Whether a run still has a fallback ahead of it depends on its kind, so the kind is asked for
 * here instead of loading every run and filtering on the other side.
 */
export function activeRunCountsByAgent(db: Db, kind: RunKind): Map<string, number> {
  const rows = db
    .prepare(
      `SELECT agent_id, COUNT(*) AS c FROM runs
       WHERE kind = ? AND status IN (${activePlaceholders})
       GROUP BY agent_id`
    )
    .all(kind, ...ACTIVE_RUN_STATUSES) as Row[]
  return new Map(rows.map((r) => [s(r.agent_id), n(r.c)]))
}

export function countActiveRunsByProject(db: Db, projectId: string): number {
  const r = db
    .prepare(
      `SELECT COUNT(*) AS c FROM runs r JOIN tasks t ON t.id = r.task_id
       WHERE t.project_id = ? AND r.status IN (${activePlaceholders})`
    )
    .get(projectId, ...ACTIVE_RUN_STATUSES) as Row
  return n(r.c)
}

export function countActiveRuns(db: Db): number {
  const r = db
    .prepare(`SELECT COUNT(*) AS c FROM runs WHERE status IN (${activePlaceholders})`)
    .get(...ACTIVE_RUN_STATUSES) as Row
  return n(r.c)
}

/**
 * That agent's recent runs, newest first, as outcomes.
 *
 * Read when a limit names no moment, to see where that agent's week last turned. Capped rather
 * than paged: a limit that recurs weekly is settled by the last few weeks, and the ones before
 * that say nothing a newer observation does not say better.
 */
export function listRunOutcomesByAgent(db: Db, agentId: string, limit = 500): RunOutcome[] {
  const rows = db
    .prepare(
      `SELECT status, error_message, started_at FROM runs
       WHERE agent_id = ? ORDER BY started_at DESC, rowid DESC LIMIT ?`
    )
    .all(agentId, limit) as Row[]
  return rows.map((r) => ({
    status: s(r.status) as RunStatus,
    errorMessage: s(r.error_message),
    startedAt: s(r.started_at)
  }))
}

// ---------------------------------------------------------------------------
// Cooldowns
// ---------------------------------------------------------------------------

export function setCooldown(db: Db, agentId: string, until: string, reason: string): void {
  db.prepare(
    `INSERT INTO agent_cooldowns (agent_id, until, reason) VALUES (?,?,?)
     ON CONFLICT(agent_id) DO UPDATE SET until = ?, reason = ?`
  ).run(agentId, until, reason, until, reason)
}

export function clearCooldown(db: Db, agentId: string): void {
  db.prepare('DELETE FROM agent_cooldowns WHERE agent_id = ?').run(agentId)
}

export function listCooldowns(db: Db): AgentCooldown[] {
  const now = nowIso()
  db.prepare('DELETE FROM agent_cooldowns WHERE until <= ?').run(now)
  return (db.prepare('SELECT * FROM agent_cooldowns').all() as Row[]).map((r) => ({
    agentId: s(r.agent_id),
    until: s(r.until),
    reason: s(r.reason)
  }))
}

/**
 * When that agent's cooldown ends, or null when it is not cooling down.
 * An expired one is swept as it is read, so the row never outlives the wait it describes.
 */
export function cooldownEnd(db: Db, agentId: string): string | null {
  const r = db.prepare('SELECT until FROM agent_cooldowns WHERE agent_id = ?').get(agentId) as
    | Row
    | undefined
  if (!r) return null
  if (s(r.until) <= nowIso()) {
    clearCooldown(db, agentId)
    return null
  }
  return s(r.until)
}

export function isCoolingDown(db: Db, agentId: string): boolean {
  return cooldownEnd(db, agentId) !== null
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

export function listGroups(db: Db): AgentGroup[] {
  const rows = db.prepare('SELECT * FROM agent_groups ORDER BY sort_order, name').all() as Row[]
  const memberStmt = db.prepare(
    'SELECT agent_id FROM agent_group_members WHERE group_id = ? ORDER BY sort_order'
  )
  return rows.map((r) => ({
    id: s(r.id),
    name: s(r.name),
    description: s(r.description),
    strategy: s(r.strategy, 'priority') as GroupStrategy,
    memberIds: (memberStmt.all(s(r.id)) as Row[]).map((m) => s(m.agent_id)),
    isDefault: i2b(r.is_default),
    sortOrder: n(r.sort_order),
    createdAt: s(r.created_at),
    updatedAt: s(r.updated_at)
  }))
}

export function getGroup(db: Db, id: string): AgentGroup | null {
  return listGroups(db).find((g) => g.id === id) ?? null
}

/** The group a project added without a run target is assigned to. null while none is marked. */
export function getDefaultGroup(db: Db): AgentGroup | null {
  const r = db.prepare('SELECT id FROM agent_groups WHERE is_default = 1 LIMIT 1').get() as Row | undefined
  return r ? getGroup(db, s(r.id)) : null
}

export function insertGroup(db: Db, input: AgentGroupInput, id = newId('grp')): AgentGroup {
  const ts = nowIso()
  const isDefault = input.isDefault ?? false
  db.prepare(
    `INSERT INTO agent_groups (id, name, description, strategy, is_default, sort_order, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?)`
  ).run(id, input.name, input.description ?? '', input.strategy ?? 'priority', b2i(isDefault), input.sortOrder ?? 0, ts, ts)
  if (isDefault) clearOtherDefaults(db, id)
  replaceGroupMembers(db, id, input.memberIds ?? [])
  return getGroup(db, id)!
}

export function updateGroup(db: Db, id: string, patch: Partial<AgentGroupInput>): AgentGroup {
  const cur = getGroup(db, id)
  if (!cur) throw new Error(`group not found: ${id}`)
  const next = { ...cur, ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) }
  const isDefault = patch.isDefault ?? cur.isDefault
  db.prepare(
    'UPDATE agent_groups SET name=?, description=?, strategy=?, is_default=?, sort_order=?, updated_at=? WHERE id=?'
  ).run(next.name, next.description, next.strategy, b2i(isDefault), next.sortOrder, nowIso(), id)
  if (patch.isDefault) clearOtherDefaults(db, id)
  if (patch.memberIds) replaceGroupMembers(db, id, patch.memberIds)
  return getGroup(db, id)!
}

/** One default at most. Marking a group takes the mark off every other in the same write. */
function clearOtherDefaults(db: Db, keepId: string): void {
  db.prepare('UPDATE agent_groups SET is_default = 0 WHERE id != ? AND is_default = 1').run(keepId)
}

function replaceGroupMembers(db: Db, groupId: string, memberIds: string[]): void {
  db.prepare('DELETE FROM agent_group_members WHERE group_id = ?').run(groupId)
  const stmt = db.prepare(
    'INSERT INTO agent_group_members (group_id, agent_id, sort_order) VALUES (?,?,?)'
  )
  memberIds.forEach((agentId, i) => stmt.run(groupId, agentId, i))
}

export function deleteGroup(db: Db, id: string): void {
  db.prepare('DELETE FROM agent_group_members WHERE group_id = ?').run(id)
  db.prepare("UPDATE projects SET target_id = NULL WHERE target_kind = 'group' AND target_id = ?").run(
    id
  )
  db.prepare('DELETE FROM agent_groups WHERE id = ?').run(id)
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

/**
 * Live projects. **Deleted ones are never returned.**
 *
 * Both the UI and the scheduler come through here, so the exclusion is not left to the caller
 * (forget it in one place and the deleted project shows up on that one screen).
 */
export function listProjects(db: Db): Project[] {
  return (
    db
      .prepare(
        'SELECT * FROM projects WHERE deleted_at IS NULL ORDER BY priority, sort_order, name'
      )
      .all() as Row[]
  ).map(toProject)
}

/** Look up by id. Deleted ones are returned too (references from run history stay followable). */
export function getProject(db: Db, id: string): Project | null {
  const r = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Row | undefined
  return r ? toProject(r) : null
}

/**
 * Look up by path. **Deleted ones are included.**
 *
 * The only way import can notice "this directory was deleted before".
 * Filter deleted rows out here and import recreates the same row, resurrecting it.
 */
export function findProjectByPath(db: Db, path: string): Project | null {
  const r = db
    .prepare('SELECT * FROM projects WHERE path = ? ORDER BY deleted_at IS NULL DESC LIMIT 1')
    .get(path) as Row | undefined
  return r ? toProject(r) : null
}

export function insertProject(db: Db, input: ProjectInput, id = newId('prj')): Project {
  const ts = nowIso()
  db.prepare(
    `INSERT INTO projects (id, name, path, color, priority, target_kind, target_id,
       max_concurrent, enabled, commit_identity_mode, commit_app_slug, commit_bot_user_id,
       commit_app_id, commit_setup_version, editor_app, report_enabled, source, sort_order,
       created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    id,
    input.name,
    input.path,
    input.color ?? '#4EA8DE',
    input.priority ?? 2,
    input.targetKind ?? 'agent',
    input.targetId ?? null,
    input.maxConcurrent ?? 1,
    b2i(input.enabled ?? true),
    input.commitIdentityMode ?? 'inherit',
    input.commitIdentity?.appSlug ?? '',
    input.commitIdentity?.botUserId ?? '',
    input.commitIdentity?.appId ?? '',
    input.commitIdentity?.setupVersion ?? 0,
    input.editorApp ?? '',
    b2i(input.reportEnabled ?? true),
    input.source ?? 'user',
    input.sortOrder ?? 0,
    ts,
    ts
  )
  return getProject(db, id)!
}

export function updateProject(db: Db, id: string, patch: Partial<ProjectInput>): Project {
  const cur = getProject(db, id)
  if (!cur) throw new Error(`project not found: ${id}`)
  const next = { ...cur, ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) }
  db.prepare(
    `UPDATE projects SET name=?, path=?, color=?, priority=?, target_kind=?, target_id=?,
       max_concurrent=?, enabled=?, commit_identity_mode=?, commit_app_slug=?,
       commit_bot_user_id=?, commit_app_id=?, commit_setup_version=?, editor_app=?,
       report_enabled=?, sort_order=?, updated_at=? WHERE id=?`
  ).run(
    next.name,
    next.path,
    next.color,
    next.priority,
    next.targetKind,
    next.targetId ?? null,
    next.maxConcurrent,
    b2i(next.enabled),
    next.commitIdentityMode ?? 'inherit',
    next.commitIdentity?.appSlug ?? '',
    next.commitIdentity?.botUserId ?? '',
    next.commitIdentity?.appId ?? '',
    next.commitIdentity?.setupVersion ?? 0,
    next.editorApp ?? '',
    b2i(next.reportEnabled ?? true),
    next.sortOrder,
    nowIso(),
    id
  )
  return getProject(db, id)!
}

/**
 * Delete a project. **Keep the row, throw away the contents (tasks and run history).**
 *
 * The row stays so import can tell "this one was deleted". A hard delete takes the already-imported
 * markers (`runs.external_key`) with it, so the same session logs get picked up as un-imported and
 * the deleted project came back on the very next sync.
 *
 * The deletion time is stamped into `import_since`. From then on only sessions started after it are
 * picked up, so starting work in that directory again brings the project back, not the deleted history.
 */
export function deleteProject(db: Db, id: string): void {
  const taskIds = (db.prepare('SELECT id FROM tasks WHERE project_id = ?').all(id) as Row[]).map(
    (r) => s(r.id)
  )
  const delRuns = db.prepare('DELETE FROM runs WHERE task_id = ?')
  const delReviewBase = db.prepare('DELETE FROM task_review_bases WHERE task_id = ?')
  taskIds.forEach((tid) => delRuns.run(tid))
  taskIds.forEach((tid) => delReviewBase.run(tid))
  const delDeps = db.prepare('DELETE FROM task_dependencies WHERE task_id = ? OR depends_on_id = ?')
  taskIds.forEach((tid) => delDeps.run(tid, tid))
  db.prepare('DELETE FROM tasks WHERE project_id = ?').run(id)
  db.prepare('DELETE FROM task_rules WHERE project_id = ?').run(id)

  const ts = nowIso()
  db.prepare('UPDATE projects SET deleted_at = ?, import_since = ?, updated_at = ? WHERE id = ?')
    .run(ts, ts, ts, id)
}

/**
 * Bring a deleted project back into view.
 *
 * `import_since` is left alone. Picking the project up again is accepted, but the deleted history
 * is not dug back up (sessions from before the deletion stay un-imported).
 */
export function reviveProject(db: Db, id: string): Project {
  db.prepare('UPDATE projects SET deleted_at = NULL, updated_at = ? WHERE id = ?').run(nowIso(), id)
  return getProject(db, id)!
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

function listDependencies(db: Db, taskId: string): TaskDependency[] {
  return (
    db
      .prepare(
        'SELECT depends_on_id, mode FROM task_dependencies WHERE task_id = ? ORDER BY sort_order'
      )
      .all(taskId) as Row[]
  ).map((r) => ({ taskId: s(r.depends_on_id), mode: s(r.mode, 'done') as DependsMode }))
}

/** Read every task's dependencies in one query, so a listing does not issue one query per task. */
function dependencyMap(db: Db): Map<string, TaskDependency[]> {
  const map = new Map<string, TaskDependency[]>()
  const rows = db
    .prepare('SELECT task_id, depends_on_id, mode FROM task_dependencies ORDER BY sort_order')
    .all() as Row[]
  for (const r of rows) {
    const list = map.get(s(r.task_id)) ?? []
    list.push({ taskId: s(r.depends_on_id), mode: s(r.mode, 'done') as DependsMode })
    map.set(s(r.task_id), list)
  }
  return map
}

/** Replace the dependencies wholesale. Self-dependencies and duplicates are dropped here. */
function replaceDependencies(db: Db, taskId: string, deps: TaskDependency[]): void {
  db.prepare('DELETE FROM task_dependencies WHERE task_id = ?').run(taskId)
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_id, mode, sort_order)
     VALUES (?,?,?,?)`
  )
  const seen = new Set<string>()
  for (const dep of deps) {
    if (dep.taskId === taskId || seen.has(dep.taskId)) continue
    stmt.run(taskId, dep.taskId, dep.mode, seen.size)
    seen.add(dep.taskId)
  }
}

export function listTasks(db: Db, includeArchived = false): Task[] {
  const sql = includeArchived
    ? 'SELECT * FROM tasks ORDER BY seq'
    : 'SELECT * FROM tasks WHERE archived = 0 ORDER BY seq'
  const deps = dependencyMap(db)
  return (db.prepare(sql).all() as Row[]).map((r) => toTask(r, deps.get(s(r.id)) ?? []))
}

export function getTask(db: Db, id: string): Task | null {
  const r = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Row | undefined
  return r ? toTask(r, listDependencies(db, id)) : null
}

function nextSeq(db: Db): number {
  const r = db.prepare('SELECT COALESCE(MAX(seq), 0) AS m FROM tasks').get() as Row
  return n(r.m) + 1
}

export function insertTask(db: Db, input: TaskInput, id = newId('tsk')): Task {
  const ts = nowIso()
  db.prepare(
    `INSERT INTO tasks (id, project_id, title, prompt, status, priority, seq, scheduled_at,
       current_run_id, session_id, agent_override_id, pending_message, reserved_message,
       review_note, source, rule_id, external_key, archived, created_at, updated_at, done_at)
     VALUES (?,?,?,?,?,?,?,?,NULL,NULL,?,'','','',?,?,?,0,?,?,NULL)`
  ).run(
    id,
    input.projectId,
    input.title,
    input.prompt ?? '',
    input.status ?? 'draft',
    input.priority ?? 2,
    nextSeq(db),
    input.scheduledAt ?? null,
    input.agentOverrideId ?? null,
    input.source ?? 'user',
    input.ruleId ?? null,
    input.externalKey ?? null,
    ts,
    ts
  )
  // Wire dependencies inside the same call that creates the task. Adding them later with a patch
  // leaves a gap where the scheduler claims the `queued` task and runs the one meant to wait
  if (input.dependsOn && input.dependsOn.length > 0) {
    replaceDependencies(db, id, input.dependsOn)
  }
  return getTask(db, id)!
}

export function patchTask(db: Db, id: string, patch: TaskPatch): Task {
  const cur = getTask(db, id)
  if (!cur) throw new Error(`task not found: ${id}`)
  const next = { ...cur, ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) }
  db.prepare(
    `UPDATE tasks SET project_id=?, title=?, prompt=?, pending_message=?, priority=?,
       scheduled_at=?, review_note=?, agent_override_id=?, updated_at=? WHERE id=?`
  ).run(
    next.projectId,
    next.title,
    next.prompt,
    next.pendingMessage,
    next.priority,
    next.scheduledAt ?? null,
    next.reviewNote,
    next.agentOverrideId ?? null,
    nowIso(),
    id
  )
  if (patch.dependsOn !== undefined) replaceDependencies(db, id, patch.dependsOn)
  return getTask(db, id)!
}

export function setTaskStatus(
  db: Db,
  id: string,
  status: TaskStatus,
  extra: {
    currentRunId?: string | null
    sessionId?: string | null
    pendingMessage?: string
    doneAt?: string | null
  } = {}
): Task {
  const cur = getTask(db, id)
  if (!cur) throw new Error(`task not found: ${id}`)
  const currentRunId =
    extra.currentRunId === undefined ? cur.currentRunId : extra.currentRunId
  const sessionId = extra.sessionId === undefined ? cur.sessionId : extra.sessionId
  const pendingMessage =
    extra.pendingMessage === undefined ? cur.pendingMessage : extra.pendingMessage
  const doneAt =
    extra.doneAt === undefined ? (status === 'done' ? nowIso() : cur.doneAt) : extra.doneAt
  db.prepare(
    `UPDATE tasks SET status=?, current_run_id=?, session_id=?, pending_message=?,
       done_at=?, updated_at=? WHERE id=?`
  ).run(status, currentRunId, sessionId, pendingMessage, doneAt, nowIso(), id)
  return getTask(db, id)!
}

/**
 * Swap the session ID used for a resumed run.
 * The way back to reality when the CLI wrote its log under an ID Quuu did not assign.
 */
/**
 * Let go of the session. The next run opens a fresh one.
 *
 * Holding on to a conversation that cannot be continued (the other side is gone, it was invalidated,
 * the CLI cannot resume) leaves the task **unable to move under any operation**. The pending message
 * is dropped with it because a message with nowhere to continue would make the next run look like a
 * resume (text worth keeping is folded into the prompt by the caller before it gets here).
 */
export function clearTaskSession(db: Db, id: string): Task {
  db.prepare(
    "UPDATE tasks SET session_id=NULL, pending_message='', updated_at=? WHERE id=?"
  ).run(nowIso(), id)
  return getTask(db, id)!
}

/**
 * Park the task until a given moment (or clear the parking with null).
 *
 * Separate from `patchTask` because this is execution writing back what it learned, not a human
 * editing the task: nothing else about the task changes, and the run it is waiting on keeps its
 * current run ID and pending message.
 */
export function setTaskSchedule(db: Db, id: string, scheduledAt: string | null): Task {
  db.prepare('UPDATE tasks SET scheduled_at=?, updated_at=? WHERE id=?').run(
    scheduledAt,
    nowIso(),
    id
  )
  return getTask(db, id)!
}

export function setTaskSessionId(db: Db, id: string, sessionId: string): Task {
  db.prepare('UPDATE tasks SET session_id=?, updated_at=? WHERE id=?').run(sessionId, nowIso(), id)
  return getTask(db, id)!
}

/** Send-back / follow-up from chat. Queues what the next run will send. */
export function setPendingMessage(db: Db, id: string, message: string): Task {
  db.prepare('UPDATE tasks SET pending_message=?, updated_at=? WHERE id=?').run(
    message,
    nowIso(),
    id
  )
  return getTask(db, id)!
}

/**
 * Reserved message. Holds text written during a run, to be sent once it finishes.
 *
 * `setTaskStatus` never touches this column, so clearing `pending_message` when a run ends does not
 * sweep away what was handed over for later.
 */
export function setReservedMessage(db: Db, id: string, message: string): Task {
  db.prepare('UPDATE tasks SET reserved_message=?, updated_at=? WHERE id=?').run(
    message,
    nowIso(),
    id
  )
  return getTask(db, id)!
}

export function setTaskArchived(db: Db, id: string, archived: boolean): Task {
  db.prepare('UPDATE tasks SET archived=?, updated_at=? WHERE id=?').run(
    b2i(archived),
    nowIso(),
    id
  )
  return getTask(db, id)!
}

export function deleteTask(db: Db, id: string): void {
  db.prepare('DELETE FROM runs WHERE task_id = ?').run(id)
  db.prepare('DELETE FROM task_review_bases WHERE task_id = ?').run(id)
  // Drop dependency edges in both directions, so a task that was waiting never stalls forever.
  db.prepare('DELETE FROM task_dependencies WHERE task_id = ? OR depends_on_id = ?').run(id, id)
  db.prepare('DELETE FROM tasks WHERE id = ?').run(id)
}

export function countTasksByStatus(db: Db, status: TaskStatus): number {
  const r = db
    .prepare('SELECT COUNT(*) AS c FROM tasks WHERE status = ? AND archived = 0')
    .get(status) as Row
  return n(r.c)
}

/**
 * Queue ordering. Used by queries that alias tasks as `t` and projects as `p`.
 *
 * The leading key is "is there a follow-up". A task sent back from review is a run a human is sitting
 * in front of waiting for an answer, so perceived latency dominates entry order and priority.
 * The condition matches `isFollowupPending()` (that is the definition, this is its SQL form).
 *
 * After that: project priority -> task priority -> entry order.
 */
export const QUEUE_ORDER_BY = `ORDER BY
       CASE WHEN t.session_id IS NOT NULL AND TRIM(t.pending_message) <> '' THEN 0 ELSE 1 END ASC,
       p.priority ASC, t.priority ASC, t.seq ASC`

/**
 * Position in the queue (1-based). Drives the "Queue #3" display.
 * The order matches the claim conditions (follow-up -> project priority -> task priority -> entry
 * order), adjusted so blockers land ahead of the tasks waiting on them (`orderTasks`).
 * Pulling follow-ups to the front is carried by both `QUEUE_ORDER_BY` and `orderTasks`.
 *
 * A task scheduled for later has no position. It is not in line for the next free slot, and
 * numbering it would both push everything behind it down and promise a turn that is not coming.
 */
export function queuePositions(db: Db, now = nowIso()): Map<string, number> {
  const priorities = new Map(listProjects(db).map((p) => [p.id, p.priority]))
  const queued = listTasks(db).filter(
    (t) => t.status === 'queued' && (t.scheduledAt === null || t.scheduledAt <= now)
  )
  const map = new Map<string, number>()
  orderTasks(queued, (projectId) => priorities.get(projectId) ?? 99).forEach((t, i) =>
    map.set(t.id, i + 1)
  )
  return map
}

/** A reserved run slot. */
export interface SlotReservation {
  taskId: string
  title: string
  projectId: string
  /** The agent to keep free. null when it cannot be decided (only the project slot is reserved). */
  agentId: string | null
}

/**
 * The run slots reserved right now: every unfinished P0 task (`holdsSlot`).
 *
 * Running tasks already hold a real slot, so they are not counted (no double reservation for one task).
 * Done ends the reservation by itself; lowering the priority is how a human lets go of one early.
 * The agent to keep free is decided as "per-task override -> most recent run": a resume inherits the
 * same session as the last run, so the last agent is the least likely to be wrong.
 */
export function listSlotReservations(db: Db): SlotReservation[] {
  const rows = db
    .prepare(
      `SELECT t.id AS id, t.title AS title, t.project_id AS project_id,
              COALESCE(t.agent_override_id,
                (SELECT r.agent_id FROM runs r WHERE r.task_id = t.id
                 ORDER BY r.started_at DESC LIMIT 1)) AS agent_id
       FROM tasks t
       WHERE t.priority = ? AND t.archived = 0
         AND t.status NOT IN ('running', 'done')
       ORDER BY t.seq`
    )
    .all(HOLDING_PRIORITY) as Row[]
  return rows.map((r) => ({
    taskId: s(r.id),
    title: s(r.title),
    projectId: s(r.project_id),
    agentId: sn(r.agent_id)
  }))
}

// ---------------------------------------------------------------------------
// Automated tasks
// ---------------------------------------------------------------------------

function toTaskRule(r: Row): TaskRule {
  return {
    id: s(r.id),
    projectId: s(r.project_id),
    name: s(r.name),
    prompt: s(r.prompt),
    priority: n(r.priority, 2) as Priority,
    agentOverrideId: sn(r.agent_override_id),
    whenIdle: i2b(r.when_idle),
    cron: s(r.cron),
    blockStatuses: parseJson<TaskStatus[]>(r.block_statuses, []),
    enabled: i2b(r.enabled),
    dueAt: sn(r.due_at),
    lastEnqueuedAt: sn(r.last_enqueued_at),
    sortOrder: n(r.sort_order),
    createdAt: s(r.created_at),
    updatedAt: s(r.updated_at)
  }
}

/**
 * When the rule may next enqueue, and when it last did.
 * Cron math lives in `shared/cron.ts`, so the repo only keeps the result.
 */
export type TaskRulePatch = Partial<TaskRuleInput> & {
  dueAt?: string | null
  lastEnqueuedAt?: string | null
}

export function listTaskRules(db: Db): TaskRule[] {
  return (
    db.prepare('SELECT * FROM task_rules ORDER BY sort_order, created_at').all() as Row[]
  ).map(toTaskRule)
}

export function listTaskRulesByProject(db: Db, projectId: string): TaskRule[] {
  return (
    db
      .prepare('SELECT * FROM task_rules WHERE project_id = ? ORDER BY sort_order, created_at')
      .all(projectId) as Row[]
  ).map(toTaskRule)
}

export function getTaskRule(db: Db, id: string): TaskRule | null {
  const r = db.prepare('SELECT * FROM task_rules WHERE id = ?').get(id) as Row | undefined
  return r ? toTaskRule(r) : null
}

export function insertTaskRule(
  db: Db,
  input: TaskRuleInput & { dueAt?: string | null },
  id = newId('rul')
): TaskRule {
  const ts = nowIso()
  db.prepare(
    `INSERT INTO task_rules (id, project_id, name, prompt, priority, agent_override_id,
       when_idle, cron, block_statuses, enabled, due_at, last_enqueued_at, sort_order,
       created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,NULL,?,?,?)`
  ).run(
    id,
    input.projectId,
    input.name,
    input.prompt ?? '',
    input.priority ?? 2,
    input.agentOverrideId ?? null,
    b2i(input.whenIdle ?? false),
    input.cron ?? '',
    JSON.stringify(input.blockStatuses ?? []),
    b2i(input.enabled ?? true),
    input.dueAt ?? null,
    input.sortOrder ?? 0,
    ts,
    ts
  )
  return getTaskRule(db, id)!
}

export function updateTaskRule(db: Db, id: string, patch: TaskRulePatch): TaskRule {
  const cur = getTaskRule(db, id)
  if (!cur) throw new Error(`task rule not found: ${id}`)
  const next = { ...cur, ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) }
  db.prepare(
    `UPDATE task_rules SET project_id=?, name=?, prompt=?, priority=?, agent_override_id=?,
       when_idle=?, cron=?, block_statuses=?, enabled=?, due_at=?, last_enqueued_at=?,
       sort_order=?, updated_at=? WHERE id=?`
  ).run(
    next.projectId,
    next.name,
    next.prompt,
    next.priority,
    next.agentOverrideId ?? null,
    b2i(next.whenIdle),
    next.cron,
    JSON.stringify(next.blockStatuses),
    b2i(next.enabled),
    next.dueAt ?? null,
    next.lastEnqueuedAt ?? null,
    next.sortOrder,
    nowIso(),
    id
  )
  return getTaskRule(db, id)!
}

/**
 * Delete the rule. Keep the tasks it created; only clear the mark of where they came from.
 *
 * What it produced are ordinary tasks, with reviews and history of their own. Wiping them out
 * because the rule was deleted would throw away a human's work.
 */
export function deleteTaskRule(db: Db, id: string): void {
  db.prepare('UPDATE tasks SET rule_id = NULL WHERE rule_id = ?').run(id)
  db.prepare('DELETE FROM task_rules WHERE id = ?').run(id)
}

/**
 * How many of the tasks that rule created are still in the given statuses.
 * Used for the duplicate check. Archived ones are not counted (the way out of one stuck task).
 */
export function countRuleTasks(db: Db, ruleId: string, statuses: TaskStatus[]): number {
  if (statuses.length === 0) return 0
  const placeholders = statuses.map(() => '?').join(',')
  const r = db
    .prepare(
      `SELECT COUNT(*) AS c FROM tasks
        WHERE rule_id = ? AND archived = 0 AND status IN (${placeholders})`
    )
    .get(ruleId, ...statuses) as Row
  return n(r.c)
}

/** How many tasks in that project are in the given statuses. Answers "is the queue empty". */
export function countProjectTasks(db: Db, projectId: string, statuses: TaskStatus[]): number {
  if (statuses.length === 0) return 0
  const placeholders = statuses.map(() => '?').join(',')
  const r = db
    .prepare(
      `SELECT COUNT(*) AS c FROM tasks
        WHERE project_id = ? AND archived = 0 AND status IN (${placeholders})`
    )
    .get(projectId, ...statuses) as Row
  return n(r.c)
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

export function insertRun(
  db: Db,
  run: Omit<Run, 'startedAt' | 'endedAt' | 'source' | 'externalKey'> & {
    startedAt?: string
    endedAt?: string | null
    source?: Run['source']
    externalKey?: string | null
  }
): Run {
  db.prepare(
    `INSERT INTO runs (id, task_id, agent_id, resolved_from_group_id, session_id, kind, status,
       attempt, fallback_from_run_id, pid, cwd, command, args, prompt_preview, exit_code,
       error_kind, error_message, session_log_path, stdout_log_path, source, external_key,
       started_at, ended_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    run.id,
    run.taskId,
    run.agentId,
    run.resolvedFromGroupId ?? null,
    run.sessionId,
    run.kind,
    run.status,
    run.attempt,
    run.fallbackFromRunId ?? null,
    run.pid ?? null,
    run.cwd,
    run.command,
    JSON.stringify(run.args),
    run.promptPreview,
    run.exitCode ?? null,
    run.errorKind ?? null,
    run.errorMessage,
    run.sessionLogPath ?? null,
    run.stdoutLogPath,
    run.source ?? 'user',
    run.externalKey ?? null,
    run.startedAt ?? nowIso(),
    run.endedAt ?? null
  )
  return getRun(db, run.id)!
}

export function getRun(db: Db, id: string): Run | null {
  const r = db.prepare('SELECT * FROM runs WHERE id = ?').get(id) as Row | undefined
  return r ? toRun(r) : null
}

export function updateRun(
  db: Db,
  id: string,
  patch: Partial<
    Pick<
      Run,
      | 'status'
      | 'pid'
      | 'exitCode'
      | 'errorKind'
      | 'errorMessage'
      // Realign with reality when the CLI wrote its log under an ID it assigned itself
      | 'sessionId'
      | 'sessionLogPath'
      | 'endedAt'
    >
  >
): Run {
  const cur = getRun(db, id)
  if (!cur) throw new Error(`run not found: ${id}`)
  const next = { ...cur, ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) }
  db.prepare(
    `UPDATE runs SET status=?, pid=?, exit_code=?, error_kind=?, error_message=?,
       session_id=?, session_log_path=?, ended_at=? WHERE id=?`
  ).run(
    next.status,
    next.pid ?? null,
    next.exitCode ?? null,
    next.errorKind ?? null,
    next.errorMessage,
    next.sessionId,
    next.sessionLogPath ?? null,
    next.endedAt ?? null,
    id
  )
  return getRun(db, id)!
}

/**
 * Session IDs already claimed by a run.
 *
 * Imported runs (source='imported') are not counted. If an ID mismatch got our own session imported
 * as an external one, refusing to re-bind it to the real run for that very reason defeats the point,
 * so the import side yields.
 */
export function claimedSessionIds(db: Db, exceptRunId: string): Set<string> {
  const rows = db
    .prepare("SELECT DISTINCT session_id FROM runs WHERE source = 'user' AND id <> ?")
    .all(exceptRunId) as Row[]
  return new Set(rows.map((r) => s(r.session_id)))
}

export function listRunsByTask(db: Db, taskId: string): Run[] {
  return (
    db
      .prepare('SELECT * FROM runs WHERE task_id = ? ORDER BY started_at DESC, rowid DESC')
      .all(taskId) as Row[]
  ).map(toRun)
}

export function listRunsForProjection(db: Db): Run[] {
  return (
    db.prepare('SELECT * FROM runs ORDER BY started_at DESC, rowid DESC').all() as Row[]
  ).map(toRun)
}

export function getTaskReviewBase(db: Db, taskId: string): TaskReviewBase | null {
  const row = db.prepare('SELECT * FROM task_review_bases WHERE task_id = ?').get(taskId) as
    | Row
    | undefined
  if (!row) return null
  return {
    taskId: s(row.task_id),
    cwd: s(row.cwd),
    startedAt: s(row.started_at),
    baseHead: sn(row.base_head),
    baseTree: sn(row.base_tree)
  }
}

/** Only the first run fixes the baseline. A fallback or follow-up never overwrites it. */
export function insertTaskReviewBase(db: Db, input: TaskReviewBase): TaskReviewBase {
  db.prepare(
    `INSERT OR IGNORE INTO task_review_bases
       (task_id, cwd, started_at, base_head, base_tree)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    input.taskId,
    input.cwd,
    input.startedAt,
    input.baseHead ?? '',
    input.baseTree ?? ''
  )
  return getTaskReviewBase(db, input.taskId)!
}

/**
 * Re-record the session ID the launched CLI chose for itself.
 *
 * When the ID Quuu minted before launch is not handed to the CLI, the record points at an ID that
 * does not exist. Leaving that lie in place breaks import, `--resume` and the conversation view all
 * at once, so it is overwritten the moment the real one is known.
 */
export function setRunSessionId(
  db: Db,
  id: string,
  sessionId: string,
  sessionLogPath: string | null
): Run {
  db.prepare('UPDATE runs SET session_id=?, session_log_path=? WHERE id=?').run(
    sessionId,
    sessionLogPath,
    id
  )
  return getRun(db, id)!
}

/**
 * Was Quuu itself running something in that working directory at that time?
 *
 * The backstop that keeps import from mistaking an agent we launched for an external session.
 * Even when exclusion by session ID does not work (a setup that does not pass the ID to the CLI),
 * the fact that we were running in the same place at the same time still stands.
 */
export function hasOwnRunCovering(db: Db, cwd: string, atIso: string): boolean {
  const row = db
    .prepare(
      `SELECT 1 AS x FROM runs
       WHERE source = 'user' AND cwd = ? AND started_at <= ?
         AND (ended_at IS NULL OR ended_at >= ?)
       LIMIT 1`
    )
    .get(cwd, atIso, atIso) as Row | undefined
  return row !== undefined
}

/**
 * A report generator started working in `cwd`.
 *
 * `until` is the moment Quuu would take it down. The window is bounded from the start because a
 * generation is not guaranteed a settle - the app can be gone before it ends, the task can be
 * deleted underneath it - and an unbounded one would keep every session started in that directory
 * afterwards out of import forever.
 */
export function openReportSession(db: Db, cwd: string, startedAt: string, until: string): void {
  db.prepare(
    'INSERT OR REPLACE INTO report_sessions (cwd, started_at, ended_at) VALUES (?,?,?)'
  ).run(cwd, startedAt, until)
}

/** The generation ended. Narrows the window from the bound to what actually happened. */
export function closeReportSession(db: Db, cwd: string, startedAt: string, endedAt: string): void {
  db.prepare('UPDATE report_sessions SET ended_at = ? WHERE cwd = ? AND started_at = ?')
    .run(endedAt, cwd, startedAt)
}

/**
 * Was a report being written there at that moment?
 *
 * The generator is an agent and leaves a session log like any other, so without this import reads
 * it as work somebody did outside Quuu and a task appears out of nowhere. Matched by place and
 * window, the same way a run Quuu started is matched.
 *
 * **Asked of `report_sessions`, never of the task's report row.** The row holds the report a task
 * has now; this question is about every generator Quuu has ever launched, including the ones whose
 * page has since been written over.
 */
export function hasOwnReportCovering(db: Db, cwd: string, atIso: string): boolean {
  const row = db
    .prepare(
      `SELECT 1 AS x FROM report_sessions
       WHERE cwd = ? AND started_at <= ? AND ended_at >= ?
       LIMIT 1`
    )
    .get(cwd, atIso, atIso) as Row | undefined
  return row !== undefined
}

export function listActiveRuns(db: Db): Run[] {
  return (
    db
      .prepare(`SELECT * FROM runs WHERE status IN (${activePlaceholders}) ORDER BY started_at`)
      .all(...ACTIVE_RUN_STATUSES) as Row[]
  ).map(toRun)
}

/** The latest run per task. Goes into the snapshot's `runs`. */
export function listLatestRunPerTask(db: Db): Run[] {
  return (
    db
      .prepare(
        `SELECT r.* FROM runs r
         JOIN (SELECT task_id, MAX(started_at) AS m FROM runs GROUP BY task_id) x
           ON x.task_id = r.task_id AND x.m = r.started_at`
      )
      .all() as Row[]
  ).map(toRun)
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export function getSetting(db: Db, key: string): string | null {
  const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as Row | undefined
  return r ? s(r.value) : null
}

export function setSetting(db: Db, key: string, value: string): void {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = ?'
  ).run(key, value, value)
}

/** Where app settings live. One JSON blob rather than a row per field. */
const APP_SETTINGS_KEY = 'app'

/**
 * App settings. **Every read goes through here.**
 *
 * Runtime values (the commit identity) are readable straight from the DB because handing a copy held
 * by App down to Runner produces a hard-to-trace skew where only the run started right after a
 * settings change uses the stale value.
 */
export function getAppSettings(db: Db): AppSettings {
  const raw = getSetting(db, APP_SETTINGS_KEY)
  if (!raw) return DEFAULT_SETTINGS
  try {
    const saved = JSON.parse(raw) as Partial<AppSettings>
    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      // Merge the nested object with the defaults too, not just the top level. Old versions have no appId / setupVersion.
      commitIdentity: {
        ...DEFAULT_SETTINGS.commitIdentity,
        ...saved.commitIdentity
      }
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveAppSettings(db: Db, settings: AppSettings): void {
  setSetting(db, APP_SETTINGS_KEY, JSON.stringify(settings))
}

// ---------------------------------------------------------------------------
// Ordering between tasks
// ---------------------------------------------------------------------------

/**
 * Blockers not satisfied yet. Empty means it may proceed.
 *
 * The condition is per dependency (`dependencyCleared`).
 * A blocker that no longer exists counts as satisfied,
 * so a dangling reference never leaves a task that can never move.
 */
export function unsatisfiedBlockers(db: Db, task: Task): Task[] {
  const blockers: Task[] = []
  for (const dep of task.dependsOn) {
    if (dep.taskId === task.id) continue
    const blocker = getTask(db, dep.taskId)
    if (!blocker) continue
    if (!dependencyCleared(blocker, dep.mode)) blockers.push(blocker)
  }
  return blockers
}

/** Are **all** blocker conditions satisfied? */
export function dependencySatisfied(db: Db, task: Task): boolean {
  return unsatisfiedBlockers(db, task).length === 0
}

/** Walk the dependency chain to see whether it would form a cycle. Self-dependencies are rejected here too. */
export function wouldCycle(db: Db, taskId: string, dependsOnIds: string[]): boolean {
  if (dependsOnIds.length === 0) return false
  const edges = new Map(
    listTasks(db, true).map((t) => [t.id, t.dependsOn.map((d) => d.taskId)] as const)
  )
  return wouldCycleIn(edges, taskId, dependsOnIds)
}

/** The tasks waiting on that task. */
export function dependents(db: Db, taskId: string): Task[] {
  const ids = (
    db.prepare('SELECT task_id FROM task_dependencies WHERE depends_on_id = ?').all(taskId) as Row[]
  ).map((r) => s(r.task_id))
  return ids.map((id) => getTask(db, id)).filter((t): t is Task => t !== null)
}

// ---------------------------------------------------------------------------
// Sync with the iPhone
// ---------------------------------------------------------------------------

/**
 * Run count per task.
 *
 * Answers "did it run again after the answer that was read on the iPhone"
 * (`decide` in `tasks/delayedRequest.ts`). One query at a time would mean one query per task on
 * every export, so they are all fetched in one pass.
 */
export function runCountsByTask(db: Db): Map<string, number> {
  const rows = db.prepare('SELECT task_id, COUNT(*) AS n FROM runs GROUP BY task_id').all() as Row[]
  return new Map(rows.map((r) => [s(r.task_id), n(r.n)]))
}

/** IDs of intents already handled. **The key that keeps one from being applied twice.** */
export function appliedIntentIds(db: Db): Set<string> {
  const rows = db.prepare('SELECT id FROM sync_intents').all() as Row[]
  return new Set(rows.map((r) => s(r.id)))
}

/** Record that an intent was handled. Ones not applied because they crossed are kept too. */
export function markIntentApplied(
  db: Db,
  intent: { id: string; device: string; seq: number; createdAt: string; op: { kind: string; taskId: string } },
  outcome: SyncOutcome,
  reason: string
): void {
  db.prepare(
    `INSERT INTO sync_intents (id, device, seq, task_id, kind, outcome, reason, created_at, applied_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET outcome = excluded.outcome, reason = excluded.reason`
  ).run(
    intent.id,
    intent.device,
    intent.seq,
    intent.op.taskId,
    intent.op.kind,
    outcome,
    reason,
    intent.createdAt,
    nowIso()
  )
}

/** The recent stubs listed on the receipt. Oldest first (the file keeps the newest at the end). */
export function recentReceipts(db: Db, limit: number): SyncReceipt[] {
  if (limit <= 0) return []
  const rows = db
    .prepare('SELECT * FROM sync_intents ORDER BY applied_at DESC, seq DESC LIMIT ?')
    .all(limit) as Row[]
  return rows
    .map((r) => ({
      intentId: s(r.id),
      device: s(r.device),
      seq: n(r.seq),
      taskId: s(r.task_id),
      at: s(r.applied_at),
      outcome: s(r.outcome) as SyncOutcome,
      reason: s(r.reason)
    }))
    .reverse()
}

/** Per-device "seen up to here" seq. Used to count what has not arrived yet. */
export function appliedSeqByDevice(db: Db): Map<string, number> {
  const rows = db
    .prepare('SELECT device, MAX(seq) AS m FROM sync_intents GROUP BY device')
    .all() as Row[]
  return new Map(rows.map((r) => [s(r.device), n(r.m)]))
}

/** Stubs that crossed (shown in the UI as operations that were not applied). */
export function recentConflicts(db: Db, limit: number): SyncReceipt[] {
  const rows = db
    .prepare("SELECT * FROM sync_intents WHERE outcome = 'conflict' ORDER BY applied_at DESC LIMIT ?")
    .all(limit) as Row[]
  return rows.map((r) => ({
    intentId: s(r.id),
    device: s(r.device),
    seq: n(r.seq),
    taskId: s(r.task_id),
    at: s(r.applied_at),
    outcome: 'conflict' as const,
    reason: s(r.reason)
  }))
}

/** SQL that narrows the auto-claim candidates. Claimability itself is defined by canClaimTask in execution/conditions. */
export function readyTaskIds(db: Db, now: string): Array<{ task_id: string; project_id: string }> {
  return db
    .prepare(
      `SELECT t.id AS task_id, t.project_id AS project_id
           FROM tasks t
           JOIN projects p ON p.id = t.project_id
           WHERE t.status = 'queued'
             AND t.archived = 0
             AND p.enabled = 1
             AND p.deleted_at IS NULL
             AND (t.scheduled_at IS NULL OR t.scheduled_at <= ?)
           ${QUEUE_ORDER_BY}`
    )
    .all(now) as Array<{ task_id: string; project_id: string }>
}

/** Find the import target for an external log from its wire identifier. */
export function findImportedRun(db: Db, key: string): { runId: string; taskId: string } | null {
  const row = db.prepare('SELECT id, task_id FROM runs WHERE external_key = ?').get(key) as { id: string; task_id: string } | undefined
  return row ? { runId: row.id, taskId: row.task_id } : null
}

export function managedSessionIds(db: Db): Set<string> {
  const rows = db.prepare("SELECT session_id FROM runs WHERE source = 'user'").all() as { session_id: string }[]
  return new Set(rows.map(row => row.session_id))
}
