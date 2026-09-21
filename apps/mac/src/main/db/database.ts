import { createRequire } from 'node:module'
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite'
import { externalAgentName } from '../agents/catalog.js'
import { promptAsValue } from '../agents/cli.js'
import { IMPORTABLE_ADAPTERS } from '../agents/cliAdapter.js'
import { dbPath, ensureAppDirs } from '../appPaths.js'
import { HOLDING_PRIORITY } from '../tasks/status.js'

/**
 * `node:sqlite` ships with Electron 43 (Node 24) and Node 24+.
 * SQLite without a native module means no rebuilds and no ABI mismatches.
 *
 * A static import makes Vite 5 strip the `node:` prefix and fail to resolve it,
 * so it is pulled in with require at runtime.
 */
const nodeRequire = createRequire(import.meta.url)
const { DatabaseSync } = nodeRequire('node:sqlite') as typeof import('node:sqlite')

export type Db = DatabaseSyncType

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agents (
  id                   TEXT PRIMARY KEY,
  name                 TEXT NOT NULL,
  description          TEXT NOT NULL DEFAULT '',
  command              TEXT NOT NULL,
  args_template        TEXT NOT NULL DEFAULT '[]',
  resume_args_template TEXT NOT NULL DEFAULT '[]',
  env                  TEXT NOT NULL DEFAULT '{}',
  concurrency          INTEGER NOT NULL DEFAULT 1,
  fallback_agent_id    TEXT,
  limit_patterns       TEXT NOT NULL DEFAULT '[]',
  cooldown_seconds     INTEGER NOT NULL DEFAULT 900,
  timeout_seconds      INTEGER NOT NULL DEFAULT 0,
  log_adapter          TEXT NOT NULL DEFAULT 'claude',
  enabled              INTEGER NOT NULL DEFAULT 1,
  source               TEXT NOT NULL DEFAULT 'user',
  sort_order           INTEGER NOT NULL DEFAULT 0,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_groups (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  strategy    TEXT NOT NULL DEFAULT 'priority',
  is_default  INTEGER NOT NULL DEFAULT 0,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_group_members (
  group_id   TEXT NOT NULL,
  agent_id   TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (group_id, agent_id)
);

CREATE TABLE IF NOT EXISTS projects (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  path           TEXT NOT NULL,
  color          TEXT NOT NULL DEFAULT '#4EA8DE',
  priority       INTEGER NOT NULL DEFAULT 2,
  target_kind    TEXT NOT NULL DEFAULT 'agent',
  target_id      TEXT,
  max_concurrent INTEGER NOT NULL DEFAULT 1,
  enabled        INTEGER NOT NULL DEFAULT 1,
  deleted_at     TEXT,
  import_since   TEXT,
  commit_identity_mode TEXT NOT NULL DEFAULT 'inherit',
  commit_app_slug      TEXT NOT NULL DEFAULT '',
  commit_bot_user_id   TEXT NOT NULL DEFAULT '',
  commit_app_id        TEXT NOT NULL DEFAULT '',
  commit_setup_version INTEGER NOT NULL DEFAULT 0,
  editor_app     TEXT NOT NULL DEFAULT '',
  report_enabled INTEGER NOT NULL DEFAULT 1,
  source         TEXT NOT NULL DEFAULT 'user',
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL,
  title          TEXT NOT NULL,
  prompt         TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'draft',
  priority       INTEGER NOT NULL DEFAULT 2,
  seq            INTEGER NOT NULL,
  scheduled_at   TEXT,
  current_run_id TEXT,
  session_id     TEXT,
  agent_override_id TEXT,
  pending_message TEXT NOT NULL DEFAULT '',
  reserved_message TEXT NOT NULL DEFAULT '',
  review_note    TEXT NOT NULL DEFAULT '',
  source          TEXT NOT NULL DEFAULT 'user',
  rule_id         TEXT,
  external_key    TEXT,
  archived       INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  done_at        TEXT
);

/**
 * Blockers. A table of its own rather than a column, so one task can wait on several.
 * The condition (mode) is carried per dependency.
 */
CREATE TABLE IF NOT EXISTS task_dependencies (
  task_id       TEXT NOT NULL,
  depends_on_id TEXT NOT NULL,
  mode          TEXT NOT NULL DEFAULT 'done',
  sort_order    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (task_id, depends_on_id)
);

/**
 * Automated tasks: a rule that creates one task once its conditions line up.
 * Bound to a project; any number of them can sit on the same project.
 */
CREATE TABLE IF NOT EXISTS task_rules (
  id                TEXT PRIMARY KEY,
  project_id        TEXT NOT NULL,
  name              TEXT NOT NULL,
  prompt            TEXT NOT NULL DEFAULT '',
  priority          INTEGER NOT NULL DEFAULT 2,
  agent_override_id TEXT,
  when_idle         INTEGER NOT NULL DEFAULT 0,
  cron              TEXT NOT NULL DEFAULT '',
  frequency         TEXT NOT NULL DEFAULT 'none',
  block_statuses    TEXT NOT NULL DEFAULT '[]',
  enabled           INTEGER NOT NULL DEFAULT 1,
  due_at            TEXT,
  last_enqueued_at  TEXT,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS runs (
  id                     TEXT PRIMARY KEY,
  task_id                TEXT NOT NULL,
  agent_id               TEXT NOT NULL,
  resolved_from_group_id TEXT,
  session_id             TEXT NOT NULL,
  kind                   TEXT NOT NULL DEFAULT 'initial',
  status                 TEXT NOT NULL DEFAULT 'starting',
  attempt                INTEGER NOT NULL DEFAULT 1,
  fallback_from_run_id   TEXT,
  pid                    INTEGER,
  cwd                    TEXT NOT NULL,
  command                TEXT NOT NULL,
  args                   TEXT NOT NULL DEFAULT '[]',
  prompt_preview         TEXT NOT NULL DEFAULT '',
  exit_code              INTEGER,
  error_kind             TEXT,
  error_message          TEXT NOT NULL DEFAULT '',
  session_log_path       TEXT,
  stdout_log_path        TEXT NOT NULL,
  source                 TEXT NOT NULL DEFAULT 'user',
  external_key           TEXT,
  started_at             TEXT NOT NULL,
  ended_at               TEXT
);

/*
 * The review baseline, pinned right before the first run.
 * One per task, so the diff is against "before this task started" and not Git's current position.
 */
CREATE TABLE IF NOT EXISTS task_review_bases (
  task_id     TEXT PRIMARY KEY,
  cwd         TEXT NOT NULL,
  started_at  TEXT NOT NULL,
  base_head   TEXT NOT NULL DEFAULT '',
  base_tree   TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS session_indexes (
  log_key TEXT PRIMARY KEY,
  stamp TEXT NOT NULL,
  generation TEXT NOT NULL,
  title TEXT,
  total INTEGER NOT NULL,
  evidence_version INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS session_messages (
  log_key TEXT NOT NULL,
  generation TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  message TEXT NOT NULL,
  PRIMARY KEY (log_key, generation, ordinal)
);
CREATE TABLE IF NOT EXISTS session_images (
  id TEXT PRIMARY KEY,
  log_key TEXT NOT NULL,
  data_url TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS task_review_evidence (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (task_id, kind, value)
);
CREATE TABLE IF NOT EXISTS task_review_snapshots (
  task_id TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
  updated_at TEXT NOT NULL,
  snapshot TEXT NOT NULL
);

/*
 * The change report attached to a task.
 *
 * Besides the page, it holds enough about the generator (pid, the page being written, the exit
 * file) to settle a generation that finished while Quuu was not running. Reports are written by
 * agents, and agents outlive the app on purpose.
 */
CREATE TABLE IF NOT EXISTS task_reports (
  task_id    TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
  status     TEXT NOT NULL,
  cwd        TEXT NOT NULL DEFAULT '',
  revision   TEXT NOT NULL DEFAULT '',
  path       TEXT NOT NULL DEFAULT '',
  pending    TEXT NOT NULL DEFAULT '',
  log_path   TEXT NOT NULL DEFAULT '',
  exit_path  TEXT NOT NULL DEFAULT '',
  error      TEXT NOT NULL DEFAULT '',
  pid        INTEGER,
  started_at TEXT NOT NULL,
  ended_at   TEXT
);

/*
 * Every agent Quuu launched to write a report: where it worked, and between when and when.
 *
 * Kept apart from task_reports on purpose. That row is a task's **current** report - the next
 * generation writes over it, and deleting the task takes it with it - while import asks about the
 * past: "was one of ours working in this directory at that moment?". Read off a row that gets
 * replaced, the answer turns to "no" the moment a report is written again, and the previous
 * generation's session is filed as work a person did: a task nobody asked for, plus a project when
 * the report ran in a worktree. That actually happened, 27 times.
 */
CREATE TABLE IF NOT EXISTS report_sessions (
  cwd        TEXT NOT NULL,
  started_at TEXT NOT NULL,
  -- When it stopped. Until it does, the moment Quuu would take it down: a generation nobody lives
  -- to settle must stop covering, or every later session in that directory stays out of import.
  ended_at   TEXT NOT NULL,
  PRIMARY KEY (cwd, started_at)
);

CREATE TABLE IF NOT EXISTS agent_cooldowns (
  agent_id TEXT PRIMARY KEY,
  until    TEXT NOT NULL,
  reason   TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Stubs of the intents that arrived from the iPhone. Carries the **idempotency key** (never apply
-- the same one twice) and the reason a crossed one is reported back. Deleting the file keeps the record.
CREATE TABLE IF NOT EXISTS sync_intents (
  id         TEXT PRIMARY KEY,   -- intent id minted by the device
  device     TEXT NOT NULL,
  seq        INTEGER NOT NULL,
  task_id    TEXT NOT NULL,
  kind       TEXT NOT NULL,
  outcome    TEXT NOT NULL,      -- applied | skipped | deferred | conflict
  reason     TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,      -- when it was tapped on the device
  applied_at TEXT NOT NULL       -- when the Mac handled it
);
`

/**
 * Indexes are kept apart from the table definitions and created after the migration.
 *
 * Put them in the same place and an index that references a new column runs "before the column
 * is added", fails on an existing DB, and the migration itself is never reached
 * (that actually happened).
 */
const INDEXES = `
CREATE INDEX IF NOT EXISTS idx_tasks_status  ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_queue   ON tasks(status, priority, seq);
CREATE INDEX IF NOT EXISTS idx_task_deps_blocker ON task_dependencies(depends_on_id);
CREATE INDEX IF NOT EXISTS idx_tasks_rule ON tasks(rule_id) WHERE rule_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_task_rules_project ON task_rules(project_id);

CREATE INDEX IF NOT EXISTS idx_runs_task   ON runs(task_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_agent  ON runs(agent_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_runs_external ON runs(external_key) WHERE external_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sync_intents_device ON sync_intents(device, seq);
CREATE INDEX IF NOT EXISTS idx_sync_intents_applied ON sync_intents(applied_at DESC);
`

export function openDatabase(path: string = dbPath()): Db {
  if (path !== ':memory:') ensureAppDirs()
  const db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA busy_timeout = 5000')
  db.exec(SCHEMA)
  migrate(db)
  db.exec(INDEXES)
  return db
}

/**
 * Migrations for forward compatibility.
 * CREATE TABLE IF NOT EXISTS never adds a new column to an existing DB,
 * so column additions are spelled out here.
 */
function migrate(db: Db): void {
  const current = getSchemaVersion(db)
  const target = 26
  if (current >= target) return

  // v1 -> v2: let the composer pick an agent for this one run.
  if (current < 2) addColumnIfMissing(db, 'tasks', 'agent_override_id', 'TEXT')

  // v2 -> v3: ordering between tasks, and importing external sessions.
  if (current < 3) {
    addColumnIfMissing(db, 'tasks', 'depends_on_id', 'TEXT')
    addColumnIfMissing(db, 'tasks', 'depends_on_mode', "TEXT NOT NULL DEFAULT 'done'")
    addColumnIfMissing(db, 'tasks', 'source', "TEXT NOT NULL DEFAULT 'user'")
    addColumnIfMissing(db, 'tasks', 'external_key', 'TEXT')
    addColumnIfMissing(db, 'projects', 'source', "TEXT NOT NULL DEFAULT 'user'")
    addColumnIfMissing(db, 'runs', 'source', "TEXT NOT NULL DEFAULT 'user'")
    addColumnIfMissing(db, 'runs', 'external_key', 'TEXT')
  }

  // v3 -> v4: blockers go from one to many. Column -> its own table (task_dependencies).
  // The table is created by SCHEMA, so all that happens here is moving the contents across.
  if (current < 4 && hasColumn(db, 'tasks', 'depends_on_id')) {
    db.exec(`
      INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_id, mode, sort_order)
      SELECT id, depends_on_id, COALESCE(depends_on_mode, 'done'), 0
        FROM tasks WHERE depends_on_id IS NOT NULL AND depends_on_id <> ''
    `)
    // Drop the index on the column before dropping the column (DROP COLUMN fails while it remains)
    db.exec('DROP INDEX IF EXISTS idx_tasks_depends')
    db.exec('ALTER TABLE tasks DROP COLUMN depends_on_id')
    db.exec('ALTER TABLE tasks DROP COLUMN depends_on_mode')
  }

  // v4 -> v5: the "send it when the run finishes" message written mid-run (the reserved message).
  if (current < 5) {
    addColumnIfMissing(db, 'tasks', 'reserved_message', "TEXT NOT NULL DEFAULT ''")
  }

  // v5 -> v6: reserve a run slot for a follow-up.
  if (current < 6) addColumnIfMissing(db, 'tasks', 'hold', 'INTEGER NOT NULL DEFAULT 0')

  // v6 -> v7: mark the agent definitions made for import as "owned by Quuu".
  //
  // On an existing DB the definitions import created sit alongside user definitions wearing the
  // same face, so they get re-marked here. Matching by name alone misses any the user renamed.
  // An agent referenced by an imported run can only have been created by import, so that is used
  // as evidence too.
  if (current < 7) {
    addColumnIfMissing(db, 'agents', 'source', "TEXT NOT NULL DEFAULT 'user'")
    db.exec(`
      UPDATE agents SET source = 'imported'
       WHERE name IN ('Codex（取り込み）', 'Claude Code（取り込み）')
          OR id IN (SELECT agent_id FROM runs WHERE source = 'imported')
    `)
  }

  /*
   * v7 -> v8: project deletion becomes a soft delete.
   *
   * A hard delete took the already-imported markers (runs.external_key) with it, so the same
   * session logs were picked up as un-imported and a deleted project always came back.
   * The row stays and carries the deletion time; only sessions started after it are picked up.
   *
   * `archived`, which only hid the row, duplicated that job, so it is folded into deleted_at and
   * dropped (both meant "keep it out of the list"; the only difference was throwing history away).
   */
  if (current < 8) {
    addColumnIfMissing(db, 'projects', 'deleted_at', 'TEXT')
    addColumnIfMissing(db, 'projects', 'import_since', 'TEXT')
    if (hasColumn(db, 'projects', 'archived')) {
      db.exec(`
        UPDATE projects
           SET deleted_at   = COALESCE(deleted_at, updated_at),
               import_since = COALESCE(import_since, updated_at)
         WHERE archived = 1
      `)
      db.exec('ALTER TABLE projects DROP COLUMN archived')
    }
  }

  /*
   * v8 -> v9: automated tasks (a rule that enqueues a task once its conditions line up).
   *
   * The table is created by SCHEMA, so all that happens here is adding the origin column to tasks.
   * Every task that already exists was made by a human, so NULL is right for them.
   */
  if (current < 9) addColumnIfMissing(db, 'tasks', 'rule_id', 'TEXT')

  /*
   * v9 -> v10: rename the import agents from the old "(imported)" suffix to "(external)".
   *
   * The list's run-target column read "unassigned" for imported tasks (projects created by import
   * carry no run target). That column now shows the CLI that actually ran, so its wording is lined
   * up with the name that appears in the run history.
   *
   * Looked up by source and log_adapter, not by name: these definitions are never shown to the
   * user and cannot be renamed, so it is safe to re-stamp them from here.
   */
  if (current < 10) {
    const rename = db.prepare(
      "UPDATE agents SET name = ? WHERE source = 'imported' AND log_adapter = ?"
    )
    for (const adapter of IMPORTABLE_ADAPTERS) rename.run(externalAgentName(adapter), adapter)
  }

  /*
   * v10 -> v11: let the commit identity (a GitHub App bot) be chosen per project.
   *
   * The default is `inherit` (follow the app settings), and the app-side default is off.
   * An identity is written into history and cannot be corrected later, so neither side turns
   * itself on quietly: **an identity nobody asked for never gets attached.**
   */
  if (current < 11) {
    addColumnIfMissing(db, 'projects', 'commit_identity_mode', "TEXT NOT NULL DEFAULT 'inherit'")
    addColumnIfMissing(db, 'projects', 'commit_app_slug', "TEXT NOT NULL DEFAULT ''")
    addColumnIfMissing(db, 'projects', 'commit_bot_user_id', "TEXT NOT NULL DEFAULT ''")
  }

  /*
   * v11 -> v12: the IDE / editor that opens this project.
   *
   * The IDE differs by language, so one app-wide default is not enough.
   * Empty means "follow the app settings", so existing rows need no touching.
   */
  if (current < 12) addColumnIfMissing(db, 'projects', 'editor_app', "TEXT NOT NULL DEFAULT ''")

  /*
   * v12 -> v13: sync with the iPhone.
   *
   * The table (`sync_intents`) is created by SCHEMA, so there is nothing to do here.
   * An existing DB holds no stubs at all, which correctly means nothing has arrived yet.
   */

  /*
   * v13 -> v14: resuming Codex.
   *
   * The stock Codex definition shipped with its resume arguments empty: there was no way to hand
   * `codex exec` a session ID, and the ID we recorded did not exist.
   * The ID can now be read off the stdout header (`session/stdoutSessionId.ts`), so
   * `codex exec resume <SESSION_ID> <PROMPT>` holds up.
   *
   * **Only fill in the empty ones.** Resume arguments a human wrote are never overwritten.
   * Flags (`--dangerously-bypass-approvals-and-sandbox` and the like) are **carried over from that
   * definition's own initial arguments**. Writing default flags would leave the resume alone stuck
   * waiting for approval for anyone configured not to ask (nobody answers, so it never finishes).
   */
  if (current < 14) fillCodexResumeArgs(db)

  /*
   * v14 -> v15: structured log display for Codex.
   *
   * The stock Codex definition shipped with stdout, so everything showed up grey as system text.
   * Codex's own rollout JSONL distinguishes conversation, thinking and tools, so existing user
   * definitions are moved over to it. sessionReadTarget keeps the stdout fallback until that log
   * exists, so output from right after launch is not lost either.
   */
  if (current < 15) preferCodexSessionLogs(db)

  /*
   * v15 -> v16: use the GitHub App for gh / git authentication, not just the commit display name.
   *
   * Existing Apps were made by the old flow that never receives a private key. Rather than guessing
   * they still work, the version stays 0 so the update button in settings replaces them with a new App.
   */
  if (current < 16) {
    addColumnIfMissing(db, 'projects', 'commit_app_id', "TEXT NOT NULL DEFAULT ''")
    addColumnIfMissing(db, 'projects', 'commit_setup_version', 'INTEGER NOT NULL DEFAULT 0')
  }

  /*
   * v16 -> v17: the review baseline as of the task's start.
   * The table is created by SCHEMA. For an existing task the baseline is filled in the first time
   * a review is opened, from the commit reachable at the first run's timestamp.
   */

  /*
   * v17 -> v18: hand the prompt to the CLI as a value, not as arguments.
   *
   * A message opening with `--cached`, or one that is exactly `review`, is text the user typed —
   * but the CLI's parser reads an unknown option or a subcommand and exits before the agent starts.
   * Definitions written before this, hand-edited ones included, are rewritten to the shape that
   * ends the option grammar.
   */
  if (current < 18) handPromptAsValue(db)

  // v19 materializes conversation pages and review results. Existing logs are backfilled
  // asynchronously after startup; opening the database must never parse session history.

  if (current < 20) {
    addColumnIfMissing(db, 'session_indexes', 'evidence_version', 'INTEGER NOT NULL DEFAULT 0')
    // Old extraction mistook URLs in source files for PR receipts. Keep only PRs
    // GitHub already resolved; ingestion recovers genuine receipts from cached messages.
    inTransaction(db, () => db.exec(`
      DELETE FROM task_review_evidence WHERE kind = 'pull-request';
      INSERT OR IGNORE INTO task_review_evidence (task_id, kind, value)
        SELECT task_id, 'pull-request', json_extract(pr.value, '$.url')
        FROM task_review_snapshots, json_each(snapshot, '$.pullRequests') AS pr
        WHERE length(json_extract(pr.value, '$.headSha')) = 40;
      UPDATE task_review_snapshots SET snapshot = json_remove(
        json_set(snapshot, '$.pullRequests', json((
          SELECT json_group_array(json(pr.value)) FROM json_each(snapshot, '$.pullRequests') AS pr
          WHERE length(json_extract(pr.value, '$.headSha')) = 40
        ))), '$.pullRequestNotice'
      ) WHERE json_array_length(snapshot, '$.pullRequests') > 0;
    `))
  }

  /*
   * v20 -> v21: change reports. The table itself is created by SCHEMA; the project switch is a
   * new column, and it starts on so that turning reports on in settings is the only step.
   */
  if (current < 21) addColumnIfMissing(db, 'projects', 'report_enabled', 'INTEGER NOT NULL DEFAULT 1')

  /*
   * v21 -> v22: where a report was written.
   *
   * The generator is an agent like any other and leaves a session log, which import then picked
   * up as work somebody did outside Quuu — a task appearing out of nowhere while another ran.
   * Knowing the place and the window is what lets import tell it apart.
   */
  if (current < 22) addColumnIfMissing(db, 'task_reports', 'cwd', "TEXT NOT NULL DEFAULT ''")

  /*
   * v22 -> v23: the group a new project starts with.
   *
   * Nothing existing is marked. An upgrade must not begin assigning a group nobody chose to
   * every project added from then on; the user marks the group, once, in its editor.
   */
  if (current < 23) addColumnIfMissing(db, 'agent_groups', 'is_default', 'INTEGER NOT NULL DEFAULT 0')

  /*
   * v23 -> v24: keeping a slot is what P0 means.
   *
   * "Reserve the slot" and "top priority" were two switches for one intent — the task a human is
   * sitting on. Tasks still keeping a slot become P0 so nothing promised to them is lost; then the
   * flag goes, so there is one thing to read.
   */
  if (current < 24 && hasColumn(db, 'tasks', 'hold')) {
    db.prepare("UPDATE tasks SET priority = ? WHERE hold = 1 AND status <> 'done' AND archived = 0")
      .run(HOLDING_PRIORITY)
    db.exec('ALTER TABLE tasks DROP COLUMN hold')
  }

  /*
   * v24 -> v25: what a report generator left behind, somewhere the next report cannot erase it.
   *
   * v22 put the place and the window on the task's report row, and that row is replaced every time
   * a report is written again - so regenerating handed the previous generation's session back to
   * import, which filed it as work somebody did. The reports already on disk are carried across so
   * an upgrade does not expose the ones written up to now. A generation still running gets the
   * bound it is running under (20 minutes, `report/operations.ts`); the settle that follows the
   * upgrade narrows it to when it really ended.
   */
  if (current < 25) {
    db.exec(`INSERT OR IGNORE INTO report_sessions (cwd, started_at, ended_at)
             SELECT cwd, started_at,
                    COALESCE(ended_at, strftime('%Y-%m-%dT%H:%M:%S.000Z', started_at, '+20 minutes'))
             FROM task_reports WHERE cwd <> ''`)
  }

  // Existing cron deadlines retain their meaning; frequency is opt-in.
  if (current < 26) addColumnIfMissing(db, 'task_rules', 'frequency', "TEXT NOT NULL DEFAULT 'none'")

  setSchemaVersion(db, target)
}

/**
 * Build the resume arguments from the initial ones. null when they cannot be built.
 *
 * Only the shape `exec [flags...] {{prompt}}` is handled. Anything else (a hand-written subcommand,
 * extra positional arguments) is left alone rather than misread.
 */
export function codexResumeArgsFrom(argsTemplate: string[]): string[] | null {
  if (argsTemplate[0] !== 'exec') return null
  const flags = argsTemplate.slice(1).filter((a) => !a.includes('{{prompt}}'))
  // Anything that is not flag-shaped (a positional argument) means we cannot tell how to assemble it
  if (flags.some((a) => !a.startsWith('-'))) return null
  return ['exec', 'resume', '{{sessionId}}', ...flags, '{{prompt}}']
}

function fillCodexResumeArgs(db: Db): void {
  const rows = db
    .prepare(
      `SELECT id, args_template FROM agents
       WHERE resume_args_template IN ('[]', '') AND log_adapter = 'stdout'
         AND (command = 'codex' OR command LIKE '%/codex')`
    )
    .all() as Array<{ id: string; args_template: string }>

  const update = db.prepare('UPDATE agents SET resume_args_template = ? WHERE id = ?')
  for (const row of rows) {
    let args: unknown
    try {
      args = JSON.parse(row.args_template)
    } catch {
      continue
    }
    if (!Array.isArray(args) || args.some((a) => typeof a !== 'string')) continue
    const resume = codexResumeArgsFrom(args as string[])
    if (resume) update.run(JSON.stringify(resume), row.id)
  }
}

function handPromptAsValue(db: Db): void {
  const rows = db
    .prepare('SELECT id, command, args_template, resume_args_template FROM agents')
    .all() as Array<{
      id: string
      command: string
      args_template: string
      resume_args_template: string
    }>

  const update = db.prepare(
    'UPDATE agents SET args_template = ?, resume_args_template = ? WHERE id = ?'
  )
  for (const row of rows) {
    const args = stringArray(row.args_template)
    const resume = stringArray(row.resume_args_template)
    if (!args || !resume) continue
    const nextArgs = JSON.stringify(promptAsValue(row.command, args))
    const nextResume = JSON.stringify(promptAsValue(row.command, resume))
    if (nextArgs === row.args_template && nextResume === row.resume_args_template) continue
    update.run(nextArgs, nextResume, row.id)
  }
}

/** A stored template, or null when it is not the array of strings we know how to rewrite. */
function stringArray(json: string): string[] | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return null
  }
  if (!Array.isArray(parsed) || parsed.some((a) => typeof a !== 'string')) return null
  return parsed as string[]
}

function preferCodexSessionLogs(db: Db): void {
  db.exec(`
    UPDATE agents SET log_adapter = 'codex'
     WHERE source = 'user' AND log_adapter = 'stdout'
       AND (command = 'codex' OR command LIKE '%/codex')
  `)
}

function hasColumn(db: Db, table: string, column: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  return columns.some((c) => c.name === column)
}

function addColumnIfMissing(db: Db, table: string, column: string, decl: string): void {
  if (hasColumn(db, table, column)) return
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`)
}

function getSchemaVersion(db: Db): number {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get('schema_version') as
    | { value: string }
    | undefined
  return row ? Number(row.value) : 0
}

function setSchemaVersion(db: Db, v: number): void {
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?')
    .run('schema_version', String(v), String(v))
}

/**
 * Write transaction. The scheduler's conditional claim always goes through here.
 * BEGIN IMMEDIATE serializes claims even when several ticks run at once.
 */
interface TransactionState { effects: (() => void)[]; next: number }
const transactions = new WeakMap<Db, TransactionState>()

/** Start notifications and runs only once the save has committed. Nested operations wait for the outermost commit too. */
export function afterCommit(db: Db, effect: () => void): void {
  const state = transactions.get(db)
  if (state) state.effects.push(effect)
  else effect()
}

/** The save succeeded. Kept distinct so a failed notification is not mistaken for a rollback. */
export class PostCommitError extends AggregateError { }

export function inTransaction<T>(db: Db, fn: () => T): T {
  const parent = transactions.get(db)
  const state = parent ?? { effects: [], next: 0 }
  const mark = state.effects.length
  const savepoint = parent ? 'operation_' + state.next++ : null
  db.exec(savepoint ? 'SAVEPOINT ' + savepoint : 'BEGIN IMMEDIATE')
  transactions.set(db, state)
  let result: T
  try {
    result = fn()
    if (result instanceof Promise) throw new Error('cannot start async work inside a transaction')
    db.exec(savepoint ? 'RELEASE ' + savepoint : 'COMMIT')
  } catch (error) {
    state.effects.length = mark
    try {
      if (savepoint) { db.exec('ROLLBACK TO ' + savepoint); db.exec('RELEASE ' + savepoint) }
      else db.exec('ROLLBACK')
    } finally { if (!parent) transactions.delete(db) }
    throw error
  }
  if (!parent) {
    transactions.delete(db)
    const failures: unknown[] = []
    for (const effect of state.effects) {
      try { effect() } catch (error) { failures.push(error) }
    }
    if (failures.length) throw new PostCommitError(failures, 'post-commit notification / run requests failed')
  }
  return result
}
