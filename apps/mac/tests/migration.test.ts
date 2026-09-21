import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../src/main/db/database.js'
import * as repo from '../src/main/db/repo.js'
import type { ReviewSnapshot } from '../src/main/review/types.js'

const nodeRequire = createRequire(import.meta.url)
const { DatabaseSync } = nodeRequire('node:sqlite') as typeof import('node:sqlite')

let dir: string
let path: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'taskd-migrate-'))
  path = join(dir, 'taskd.db')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

/** Build a v2-era DB (no ordering-control or import columns). */
function makeV2Database(): void {
  const db = new DatabaseSync(path)
  db.exec(`
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE agents (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
      command TEXT NOT NULL, args_template TEXT NOT NULL DEFAULT '[]',
      resume_args_template TEXT NOT NULL DEFAULT '[]', env TEXT NOT NULL DEFAULT '{}',
      concurrency INTEGER NOT NULL DEFAULT 1, fallback_agent_id TEXT,
      limit_patterns TEXT NOT NULL DEFAULT '[]', cooldown_seconds INTEGER NOT NULL DEFAULT 900,
      timeout_seconds INTEGER NOT NULL DEFAULT 0, log_adapter TEXT NOT NULL DEFAULT 'claude',
      enabled INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE agent_groups (id TEXT PRIMARY KEY, name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '', strategy TEXT NOT NULL DEFAULT 'priority',
      sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE agent_group_members (group_id TEXT NOT NULL, agent_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (group_id, agent_id));
    CREATE TABLE projects (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#4EA8DE', priority INTEGER NOT NULL DEFAULT 2,
      target_kind TEXT NOT NULL DEFAULT 'agent', target_id TEXT,
      max_concurrent INTEGER NOT NULL DEFAULT 1, enabled INTEGER NOT NULL DEFAULT 1,
      archived INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE tasks (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT NOT NULL,
      prompt TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft',
      priority INTEGER NOT NULL DEFAULT 2, seq INTEGER NOT NULL, scheduled_at TEXT,
      current_run_id TEXT, session_id TEXT, agent_override_id TEXT,
      pending_message TEXT NOT NULL DEFAULT '', review_note TEXT NOT NULL DEFAULT '',
      archived INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL, done_at TEXT);
    CREATE TABLE runs (
      id TEXT PRIMARY KEY, task_id TEXT NOT NULL, agent_id TEXT NOT NULL,
      resolved_from_group_id TEXT, session_id TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'initial',
      status TEXT NOT NULL DEFAULT 'starting', attempt INTEGER NOT NULL DEFAULT 1,
      fallback_from_run_id TEXT, pid INTEGER, cwd TEXT NOT NULL, command TEXT NOT NULL,
      args TEXT NOT NULL DEFAULT '[]', prompt_preview TEXT NOT NULL DEFAULT '',
      exit_code INTEGER, error_kind TEXT, error_message TEXT NOT NULL DEFAULT '',
      session_log_path TEXT, stdout_log_path TEXT NOT NULL,
      started_at TEXT NOT NULL, ended_at TEXT);
    CREATE TABLE agent_cooldowns (agent_id TEXT PRIMARY KEY, until TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '');
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `)
  db.prepare("INSERT INTO meta (key,value) VALUES ('schema_version','2')").run()
  const ts = new Date().toISOString()
  db.prepare(
    `INSERT INTO projects (id,name,path,color,priority,target_kind,target_id,max_concurrent,
      enabled,archived,sort_order,created_at,updated_at)
     VALUES ('prj','p','/tmp','#fff',2,'agent',NULL,1,1,0,0,?,?)`
  ).run(ts, ts)
  db.prepare(
    `INSERT INTO tasks (id,project_id,title,prompt,status,priority,seq,created_at,updated_at)
     VALUES ('tsk','prj','既存タスク','', 'draft',2,1,?,?)`
  ).run(ts, ts)
  db.prepare(
    `INSERT INTO agent_groups (id,name,description,strategy,sort_order,created_at,updated_at)
     VALUES ('grp','既存グループ','','priority',0,?,?)`
  ).run(ts, ts)
  db.close()
}

/** Build a v3-era DB (single-predecessor column) and wire up one dependency. */
function makeV3Database(): void {
  makeV2Database()
  const db = new DatabaseSync(path)
  db.exec(`
    ALTER TABLE tasks ADD COLUMN depends_on_id TEXT;
    ALTER TABLE tasks ADD COLUMN depends_on_mode TEXT NOT NULL DEFAULT 'done';
    ALTER TABLE tasks ADD COLUMN source TEXT NOT NULL DEFAULT 'user';
    ALTER TABLE tasks ADD COLUMN external_key TEXT;
    ALTER TABLE projects ADD COLUMN source TEXT NOT NULL DEFAULT 'user';
    ALTER TABLE runs ADD COLUMN source TEXT NOT NULL DEFAULT 'user';
    ALTER TABLE runs ADD COLUMN external_key TEXT;
    CREATE INDEX idx_tasks_depends ON tasks(depends_on_id);
  `)
  const ts = new Date().toISOString()
  db.prepare(
    `INSERT INTO tasks (id,project_id,title,prompt,status,priority,seq,created_at,updated_at,
       depends_on_id,depends_on_mode)
     VALUES ('tsk2','prj','後のタスク','','queued',2,2,?,?,'tsk','finished')`
  ).run(ts, ts)
  db.prepare("UPDATE meta SET value='3' WHERE key='schema_version'").run()
  db.close()
}

describe('schema migration', () => {
  it('legacy app settings read back as a version that needs the GitHub App update', () => {
    makeV2Database()
    const seed = new DatabaseSync(path)
    seed
      .prepare("INSERT INTO settings (key,value) VALUES ('app',?)")
      .run(
        JSON.stringify({
          commitIdentityEnabled: true,
          commitIdentity: { appSlug: 'legacy-app', botUserId: '123' }
        })
      )
    seed.close()

    const db = openDatabase(path)
    expect(repo.getAppSettings(db).commitIdentity).toEqual({
      appSlug: 'legacy-app',
      botUserId: '123',
      appId: '',
      setupVersion: 0
    })
    db.close()
  })

  /*
   * The writer used to be one agent ID of its own. Left to the defaults it reads back as "nobody",
   * which leaves the feature switched on and quietly writing nothing.
   */
  it('keeps the agent a settings file named before a group could write reports', () => {
    makeV2Database()
    const seed = new DatabaseSync(path)
    seed
      .prepare("INSERT INTO settings (key,value) VALUES ('app',?)")
      .run(JSON.stringify({ reportEnabled: true, reportAgentId: 'agt_opus' }))
    seed.close()

    const db = openDatabase(path)
    expect(repo.getAppSettings(db)).toMatchObject({
      reportEnabled: true,
      reportTargetKind: 'agent',
      reportTargetId: 'agt_opus'
    })
    db.close()
  })

  it('opening a v2 DB adds the new columns and keeps existing data', () => {
    makeV2Database()

    const db = openDatabase(path)
    const columns = (db.prepare('PRAGMA table_info(tasks)').all() as Array<{ name: string }>).map(
      (c) => c.name
    )
    expect(columns).toContain('source')
    expect(columns).toContain('external_key')
    expect(columns).toContain('reserved_message')
    // Keeping a slot is what P0 means now; the separate flag is gone
    expect(columns).not.toContain('hold')
    // Where automated tasks come from. Existing tasks were created by humans, so it stays NULL
    expect(columns).toContain('rule_id')
    expect(repo.listTaskRules(db)).toEqual([])

    const runCols = (db.prepare('PRAGMA table_info(runs)').all() as Array<{ name: string }>).map(
      (c) => c.name
    )
    expect(runCols).toContain('external_key')

    // Existing projects must not silently gain a commit identity nobody set up
    const projects = repo.listProjects(db)
    expect(projects.map((p) => p.commitIdentityMode)).toEqual(projects.map(() => 'inherit'))
    expect(projects.map((p) => p.commitIdentity.appId)).toEqual(projects.map(() => ''))
    expect(projects.map((p) => p.commitIdentity.setupVersion)).toEqual(projects.map(() => 0))
    // The IDE to open also carries over as undecided (= follow the app setting)
    expect(projects.map((p) => p.editorApp)).toEqual(projects.map(() => ''))
    // Reports arrive switched on per project: the app-wide setting is the one that decides
    expect(projects.map((p) => p.reportEnabled)).toEqual(projects.map(() => true))
    // Where a report ran, so import can tell one apart from work somebody did
    expect(
      (db.prepare('PRAGMA table_info(task_reports)').all() as Array<{ name: string }>)
        .map((column) => column.name)
    ).toContain('cwd')

    // An existing group does not become the default on its own: an upgrade must not start
    // assigning a group nobody chose to every project added from then on
    const groups = repo.listGroups(db)
    expect(groups.map((g) => g.name)).toEqual(['既存グループ'])
    expect(groups.map((g) => g.isDefault)).toEqual([false])

    const version = db.prepare("SELECT value FROM meta WHERE key='schema_version'").get() as {
      value: string
    }
    expect(version.value).toBe('26')
    for (const table of ['session_indexes', 'session_messages', 'session_images', 'task_review_evidence', 'task_review_snapshots', 'task_reports']) {
      expect(db.prepare(`PRAGMA table_info(${table})`).all().length).toBeGreaterThan(0)
    }

    const reviewBaseColumns = (
      db.prepare('PRAGMA table_info(task_review_bases)').all() as Array<{ name: string }>
    ).map((column) => column.name)
    expect(reviewBaseColumns).toEqual([
      'task_id',
      'cwd',
      'started_at',
      'base_head',
      'base_tree'
    ])

    // Bookkeeping for iPhone sync. An existing DB has none (= nothing has arrived yet)
    expect(repo.appliedIntentIds(db).size).toBe(0)

    const tasks = repo.listTasks(db)
    expect(tasks).toHaveLength(1)
    expect(tasks[0].title).toBe('既存タスク')
    expect(tasks[0].dependsOn).toEqual([])
    expect(tasks[0].source).toBe('user')
    // An existing task keeps its priority (it never held a slot, so it does not become P0)
    expect(tasks[0].priority).toBe(2)
    db.close()
  })

  it('the v3 predecessor (single column) is carried into the dependency table', () => {
    makeV3Database()

    const db = openDatabase(path)
    const later = repo.listTasks(db).find((t) => t.id === 'tsk2')
    expect(later?.dependsOn).toEqual([{ taskId: 'tsk', mode: 'finished' }])

    // After the move the column itself is dropped (keeping both makes it unclear which is authoritative)
    const columns = (db.prepare('PRAGMA table_info(tasks)').all() as Array<{ name: string }>).map(
      (c) => c.name
    )
    expect(columns).not.toContain('depends_on_id')
    expect(columns).not.toContain('depends_on_mode')

    expect(repo.dependents(db, 'tsk').map((t) => t.id)).toEqual(['tsk2'])
    db.close()
  })

  it('the dependency-table move, reserved send, and slot-hold migrations apply back to back', () => {
    makeV3Database()

    const db = openDatabase(path)
    // v3 -> v4 (dependency table), v4 -> v5 (reserved send), v5 -> v6 (hold), v23 -> v24 (hold folded into P0) all pass in one launch
    const columns = (db.prepare('PRAGMA table_info(tasks)').all() as Array<{ name: string }>).map(
      (c) => c.name
    )
    expect(columns).toContain('reserved_message')
    expect(columns).not.toContain('hold')
    expect(columns).not.toContain('depends_on_id')

    const later = repo.getTask(db, 'tsk2')
    expect(later?.dependsOn).toEqual([{ taskId: 'tsk', mode: 'finished' }])
    // Existing rows get the defaults too (NOT NULL, so a lingering null breaks reads)
    expect(later?.reservedMessage).toBe('')
    expect(later?.priority).toBe(2)

    const version = db.prepare("SELECT value FROM meta WHERE key='schema_version'").get() as {
      value: string
    }
    expect(version.value).toBe('26')
    db.close()
  })

  it('a task that was keeping a slot arrives as P0, so nothing promised to it is lost', () => {
    makeV3Database()
    const seed = new DatabaseSync(path)
    // The v6 flag, as a DB from that era carries it
    seed.exec("ALTER TABLE tasks ADD COLUMN hold INTEGER NOT NULL DEFAULT 0")
    const ts = new Date().toISOString()
    seed.prepare(
      `INSERT INTO tasks (id,project_id,title,prompt,status,priority,seq,created_at,updated_at,hold)
       VALUES ('tsk3','prj','終わった確保','','done',1,3,?,?,1)`
    ).run(ts, ts)
    seed.prepare("UPDATE tasks SET hold = 1 WHERE id = 'tsk2'").run()
    seed.close()

    const db = openDatabase(path)
    // Still unfinished and keeping a slot: it now keeps it as P0
    expect(repo.getTask(db, 'tsk2')?.priority).toBe(0)
    // Never held one: untouched
    expect(repo.getTask(db, 'tsk')?.priority).toBe(2)
    // Already done: the reservation had ended, so its priority is not rewritten
    expect(repo.getTask(db, 'tsk3')?.priority).toBe(1)
    expect(repo.listSlotReservations(db).map((r) => r.taskId)).toEqual(['tsk2'])
    db.close()
  })

  it('archived projects are carried over as soft-deleted', () => {
    makeV2Database()
    const seed = new DatabaseSync(path)
    const ts = new Date().toISOString()
    seed
      .prepare(
        `INSERT INTO projects (id,name,path,color,priority,target_kind,target_id,max_concurrent,
          enabled,archived,sort_order,created_at,updated_at)
         VALUES ('prj2','棚に上げてあったもの','/private/tmp','#fff',2,'agent',NULL,1,1,1,1,?,?)`
      )
      .run(ts, ts)
    seed.close()

    const db = openDatabase(path)

    // No hide-only column is kept (its role overlaps deleted_at)
    const columns = (
      db.prepare('PRAGMA table_info(projects)').all() as Array<{ name: string }>
    ).map((c) => c.name)
    expect(columns).toContain('deleted_at')
    expect(columns).toContain('import_since')
    expect(columns).not.toContain('archived')

    // What was archived is treated as deleted. It does not show up in the list
    expect(repo.listProjects(db).map((p) => p.id)).toEqual(['prj'])
    const shelved = repo.getProject(db, 'prj2')
    expect(shelved?.deletedAt).not.toBeNull()
    // Also stamp the import cutoff (so old logs do not flood in the moment it is opened)
    expect(shelved?.importSince).not.toBeNull()

    // The live one is not deleted
    expect(repo.getProject(db, 'prj')?.deletedAt).toBeNull()
    db.close()
  })

  it('opening a v3 DB repeatedly does not multiply dependencies', () => {
    makeV3Database()
    for (let i = 0; i < 3; i++) {
      const db = openDatabase(path)
      expect(repo.getTask(db, 'tsk2')?.dependsOn).toEqual([{ taskId: 'tsk', mode: 'finished' }])
      db.close()
    }
  })

  it('opening repeatedly does not break anything', () => {
    makeV2Database()
    for (let i = 0; i < 3; i++) {
      const db = openDatabase(path)
      expect(repo.listTasks(db)).toHaveLength(1)
      db.close()
    }
  })

  it("import agents in an existing DB get marked as Quuu's own", () => {
    makeV3Database()
    const db = new DatabaseSync(path)
    const ts = new Date().toISOString()
    const agent = (id: string, name: string): void => {
      db.prepare(
        `INSERT INTO agents (id,name,command,created_at,updated_at) VALUES (?,?,'claude',?,?)`
      ).run(id, name, ts, ts)
    }
    agent('agt-import', 'Codex（取り込み）')
    // An import definition the user had renamed. The name alone cannot tell it apart
    agent('agt-renamed', 'むかしの取り込み')
    agent('agt-mine', 'Claude Opus')
    db.prepare(
      `INSERT INTO runs (id,task_id,agent_id,session_id,cwd,command,stdout_log_path,started_at,source)
       VALUES ('run','tsk','agt-renamed','s','/tmp','claude','/tmp/x.log',?, 'imported')`
    ).run(ts)
    db.close()

    const migrated = openDatabase(path)
    const bySource = new Map(repo.listAgents(migrated).map((a) => [a.id, a.source]))
    expect(bySource.get('agt-import')).toBe('imported')
    expect(bySource.get('agt-renamed')).toBe('imported')
    // User definitions are not swept up
    expect(bySource.get('agt-mine')).toBe('user')
    migrated.close()
  })

  it('import agent names are unified to the external suffix', () => {
    // Renamed so the run-target column in the list and the run history do not disagree on the name
    makeV3Database()
    const db = new DatabaseSync(path)
    // source is the column added in v7. Build a DB where the imported mark is already set
    db.exec("ALTER TABLE agents ADD COLUMN source TEXT NOT NULL DEFAULT 'user'")
    const ts = new Date().toISOString()
    const agent = (id: string, name: string, adapter: string, source: string): void => {
      db.prepare(
        `INSERT INTO agents (id,name,command,log_adapter,source,created_at,updated_at)
         VALUES (?,?,'x',?,?,?,?)`
      ).run(id, name, adapter, source, ts, ts)
    }
    agent('agt-codex', 'Codex（取り込み）', 'codex', 'imported')
    agent('agt-cursor', 'Cursor（取り込み）', 'cursor', 'imported')
    // User definitions stay untouched even when the name is confusing
    agent('agt-mine', 'ぼくの Codex（取り込み）', 'codex', 'user')
    db.close()

    const migrated = openDatabase(path)
    const byId = new Map(repo.listAgents(migrated).map((a) => [a.id, a.name]))
    expect(byId.get('agt-codex')).toBe('Codex (external)')
    expect(byId.get('agt-cursor')).toBe('Cursor (external)')
    expect(byId.get('agt-mine')).toBe('ぼくの Codex（取り込み）')
    migrated.close()
  })

  it('Codex definitions with empty resume args get a resume that inherits their own flags', () => {
    makeV2Database()
    const db = new DatabaseSync(path)
    const ts = new Date().toISOString()
    const agent = (
      id: string,
      command: string,
      args: string[],
      resume: string[],
      adapter = 'stdout'
    ): void => {
      db.prepare(
        `INSERT INTO agents (id,name,command,args_template,resume_args_template,log_adapter,
           created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?)`
      ).run(id, id, command, JSON.stringify(args), JSON.stringify(resume), adapter, ts, ts)
    }
    // The no-approval flags must be inherited from the definition, or only the resume stalls waiting for approval
    agent('a-codex', 'codex', [
      'exec',
      '--dangerously-bypass-approvals-and-sandbox',
      '--skip-git-repo-check',
      '{{prompt}}'
    ], [])
    // A full path is still the same CLI
    agent('a-path', '/opt/homebrew/bin/codex', ['exec', '{{prompt}}'], [])
    // Hand-written resume args stay untouched
    agent('a-mine', 'codex', ['exec', '{{prompt}}'], ['exec', 'resume', '--last', '{{prompt}}'])
    // Unrecognizable shapes stay untouched (the user wrote their own subcommand)
    agent('a-odd', 'codex', ['exec', 'review', '{{prompt}}'], [])
    // Other CLIs are out of scope
    agent('a-claude', 'claude', ['-p', '{{prompt}}'], [], 'claude')
    db.close()

    const migrated = openDatabase(path)
    const byId = new Map(repo.listAgents(migrated).map((a) => [a.id, a]))
    // v18 then hands the prompt over as a value, so every one of them ends with `-- {{prompt}}`
    expect(byId.get('a-codex')?.resumeArgsTemplate).toEqual([
      'exec',
      'resume',
      '{{sessionId}}',
      '--dangerously-bypass-approvals-and-sandbox',
      '--skip-git-repo-check',
      '--',
      '{{prompt}}'
    ])
    expect(byId.get('a-path')?.resumeArgsTemplate).toEqual([
      'exec',
      'resume',
      '{{sessionId}}',
      '--',
      '{{prompt}}'
    ])
    expect(byId.get('a-mine')?.resumeArgsTemplate).toEqual([
      'exec',
      'resume',
      '--last',
      '--',
      '{{prompt}}'
    ])
    expect(byId.get('a-odd')?.resumeArgsTemplate).toEqual([])
    expect(byId.get('a-claude')?.resumeArgsTemplate).toEqual([])
    // Existing Codex agents also move to structured logs; other CLIs stay as they are
    for (const id of ['a-codex', 'a-path', 'a-mine', 'a-odd']) {
      expect(byId.get(id)?.logAdapter).toBe('codex')
    }
    expect(byId.get('a-claude')?.logAdapter).toBe('claude')
    migrated.close()
  })

  it('existing definitions are rewritten to hand the prompt over as a value', () => {
    makeV2Database()
    const db = new DatabaseSync(path)
    const ts = new Date().toISOString()
    const agent = (id: string, command: string, args: string[], adapter = 'claude'): void => {
      db.prepare(
        `INSERT INTO agents (id,name,command,args_template,resume_args_template,log_adapter,
           created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?)`
      ).run(id, id, command, JSON.stringify(args), '[]', adapter, ts, ts)
    }
    // A hand-edited definition is the common case; the flags the user added must survive
    agent('p-claude', 'claude', ['--dangerously-skip-permissions', '-p', '{{prompt}}'])
    agent('p-codex', 'codex', ['exec', '--skip-git-repo-check', '{{prompt}}'], 'codex')
    // Grok's prompt is an option value, so `--` cannot be what ends the grammar
    agent('p-grok', 'grok', ['-p', '{{prompt}}', '--session-id', '{{sessionId}}'], 'grok')
    // Copilot's --prompt already takes whatever follows, and a wrapper is not ours to rearrange
    agent('p-copilot', 'copilot', ['-p', '{{prompt}}', '--allow-all-tools'], 'copilot')
    agent('p-wrapper', 'my-agent', ['-p', '{{prompt}}'])
    db.close()

    const migrated = openDatabase(path)
    const byId = new Map(repo.listAgents(migrated).map((a) => [a.id, a]))
    expect(byId.get('p-claude')?.argsTemplate).toEqual([
      '--dangerously-skip-permissions',
      '-p',
      '--',
      '{{prompt}}'
    ])
    expect(byId.get('p-codex')?.argsTemplate).toEqual([
      'exec',
      '--skip-git-repo-check',
      '--',
      '{{prompt}}'
    ])
    expect(byId.get('p-grok')?.argsTemplate).toEqual([
      '--single={{prompt}}',
      '--session-id',
      '{{sessionId}}'
    ])
    expect(byId.get('p-copilot')?.argsTemplate).toEqual(['-p', '{{prompt}}', '--allow-all-tools'])
    expect(byId.get('p-wrapper')?.argsTemplate).toEqual(['-p', '{{prompt}}'])
    migrated.close()
  })

  it.each([false, true])('removes legacy phantom PRs while preserving fetched PRs and other saved review data (%s)', fetched => {
    makeV2Database()
    const old = openDatabase(path)
    const phantom = { number: 42, url: 'https://github.com/openai/quuu/pull/42', title: 'Pull Request #42',
      headRefName: '', baseRefName: '', headSha: '', draft: false, updatedAt: '', check: 'neutral' as const, files: [] }
    const verified = { ...phantom, number: 7, url: 'https://github.com/upstream/repo/pull/7', headSha: 'a'.repeat(40), title: 'Real PR' }
    const snapshot: ReviewSnapshot = { cwd: '/tmp', branch: 'main', repository: 'owner/repo', tree: [],
      changes: [{ path: 'result.ts', change: 'added' }], stagedChanges: [], stagedRevision: null, localChanges: [],
      revision: { base: 'a'.repeat(40), head: 'b'.repeat(40) }, localRevision: null,
      commits: [{ sha: 'a'.repeat(40), shortSha: 'aaaaaaa', subject: 'Saved commit', author: 'Fixture', committedAt: '', files: [] }],
      pullRequests: [phantom, ...(fetched ? [verified] : [])], pullRequestNotice: 'Repository not found', coverage: null, projectTasks: [] }
    repo.recordReviewEvidence(old, 'tsk', 'commit', 'aaaaaaa')
    repo.recordReviewEvidence(old, 'tsk', 'pull-request', phantom.url)
    repo.saveReviewSnapshot(old, 'tsk', snapshot)
    old.exec(`
      UPDATE meta SET value = '19' WHERE key = 'schema_version';
      ALTER TABLE session_indexes DROP COLUMN evidence_version;
      INSERT INTO session_indexes (log_key, stamp, generation, title, total) VALUES ('log', 'stamp', 'generation', NULL, 1);
      INSERT INTO session_messages VALUES ('log', 'generation', 0, '{}');
    `)
    const task = repo.getTask(old, 'tsk')
    old.close()

    const migrated = openDatabase(path)
    expect(repo.getReviewSnapshot(migrated, 'tsk')?.snapshot).toEqual({ ...snapshot,
      pullRequests: fetched ? [verified] : [], pullRequestNotice: undefined })
    expect(repo.reviewEvidence(migrated, 'tsk')).toEqual({ commits: ['aaaaaaa'], pullRequests: fetched ? [verified.url] : [] })
    expect(repo.getSessionIndex(migrated, 'log')).toMatchObject({ stamp: 'stamp', generation: 'generation', evidenceVersion: 0 })
    expect(repo.readSessionMessages(migrated, 'log', 'generation', 0, 1)).toEqual([{}])
    expect(repo.getTask(migrated, 'tsk')).toEqual(task)
    repo.recordReviewEvidence(migrated, 'tsk', 'pull-request', verified.url)
    migrated.close()
    const reopened = openDatabase(path)
    expect(repo.reviewEvidence(reopened, 'tsk').pullRequests).toEqual([verified.url])
    reopened.close()
  })

  /*
   * v24 -> v25: the reports written up to the upgrade stay recognized as ours.
   *
   * Their place and window used to be read off the task's report row, which the next generation
   * replaces — so without carrying them across, the first report regenerated after an update would
   * hand the one before it to import as work somebody did.
   */
  it('carries the reports a v24 DB already holds into the record import reads', () => {
    makeV2Database()
    const old = openDatabase(path)
    const started = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const ended = new Date(Date.now() - 59 * 60 * 1000).toISOString()
    repo.saveTaskReport(old, {
      taskId: 'tsk', status: 'ready', cwd: '/tmp/work', revision: '', path: '', logPath: '',
      exitPath: '', error: '', pid: null, pending: '', startedAt: started, endedAt: ended
    })
    // A DB from before this version: it knows where the report ran, and nothing else does
    old.exec("DELETE FROM report_sessions; UPDATE meta SET value = '24' WHERE key = 'schema_version'")
    old.close()

    const migrated = openDatabase(path)
    expect(repo.hasOwnReportCovering(migrated, '/tmp/work', started)).toBe(true)
    // The window is still the one the generation had: what came after it is somebody's own work
    expect(repo.hasOwnReportCovering(migrated, '/tmp/work', new Date().toISOString())).toBe(false)

    // Writing the report again replaces the row, and the generation before it stays covered
    repo.saveTaskReport(migrated, {
      taskId: 'tsk', status: 'generating', cwd: '/tmp/work', revision: '', path: '', logPath: '',
      exitPath: '', error: '', pid: null, pending: '', startedAt: new Date().toISOString(), endedAt: null
    })
    expect(repo.hasOwnReportCovering(migrated, '/tmp/work', started)).toBe(true)
    migrated.close()
  })

  it('a fresh DB gets the indexes too', () => {
    const db = openDatabase(path)
    const indexes = (
      db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all() as Array<{
        name: string
      }>
    ).map((r) => r.name)
    expect(indexes).toContain('idx_runs_external')
    expect(indexes).toContain('idx_task_deps_blocker')
    db.close()
  })
})

describe('calendar frequency migration', () => {
  it('preserves existing cron rules and their deadlines, and persists a new frequency across reopening', () => {
    makeV2Database()
    const old = openDatabase(path)
    const projectId = repo.listProjects(old)[0].id
    const rule = repo.insertTaskRule(old, {
      projectId, name: 'Daily cron', prompt: '', priority: 2, agentOverrideId: null,
      whenIdle: true, cron: '0 3 * * *', blockStatuses: ['review'], enabled: true,
      sortOrder: 0, dueAt: '2026-09-22T03:00:00.000Z'
    })
    old.exec("ALTER TABLE task_rules DROP COLUMN frequency; UPDATE meta SET value = '25' WHERE key = 'schema_version'")
    old.close()
    const migrated = openDatabase(path)
    expect(repo.getTaskRule(migrated, rule.id)).toEqual({ ...rule, frequency: 'none' })
    repo.updateTaskRule(migrated, rule.id, { frequency: 'weekly', cron: '' })
    migrated.close()
    const reopened = openDatabase(path)
    expect(repo.getTaskRule(reopened, rule.id)?.frequency).toBe('weekly')
    reopened.close()
  })
})
