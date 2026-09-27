import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { inTransaction, openDatabase, type Db } from '../src/main/db/database.js'
import * as repo from '../src/main/db/repo.js'
import { HookOperations } from '../src/main/hooks/operations.js'
import { resolveHooks, validateHooks } from '../src/main/hooks/config.js'
import type { HookEvent, TaskHook } from '../src/main/hooks/types.js'
import { Runner } from '../src/main/execution/runner.js'
import { Scheduler } from '../src/main/execution/scheduler.js'
import { WorkspaceOperations } from '../src/main/projects/workspace.js'
import { TaskOperations } from '../src/main/tasks/operations.js'
import { ensureTaskWorktree } from '../src/main/tasks/worktrees.js'
import { makeAgent, makeProject, makeTask, occupy } from './helpers.js'

vi.mock('../src/main/platform/shellEnv.js', () => ({ resolveLoginPath: () => Promise.resolve(process.env.PATH ?? '/usr/bin:/bin') }))

let dir: string, db: Db, projectId: string, agentId: string, hooks: HookOperations, tasks: TaskOperations
let runner: Runner, scheduler: Scheduler
function configure(definitions: TaskHook[]): void { repo.saveAppSettings(db, { ...repo.getAppSettings(db), taskHooks: definitions }) }
function command(events: HookEvent[], input = 'printf ok', id = 'custom'): TaskHook {
  return { id, enabled: true, events, kind: 'command', command: input }
}
async function settled(taskId: string): Promise<void> {
  await vi.waitFor(async () => {
    await hooks.tick()
    expect(repo.listHookRuns(db, { taskId, active: true })).toHaveLength(0)
  }, { timeout: 10_000, interval: 50 })
}
function git(...args: string[]): string { return execFileSync('/usr/bin/git', ['-C', dir, ...args], { encoding: 'utf8' }).trim() }
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'quuu-hooks-'))
  vi.stubEnv('QUUU_USER_DATA', join(dir, 'data'))
  db = openDatabase(join(dir, 'test.db'))
  agentId = makeAgent(db, { name: 'test', command: '/bin/echo', logAdapter: 'stdout' })
  projectId = makeProject(db, { name: 'test project', path: dir, targetId: agentId })
  const workspace = new WorkspaceOperations(db, () => repo.getAppSettings(db))
  hooks = new HookOperations(db, () => {}, id => workspace.workingDir({ kind: 'task', id })?.dir ?? null)
  runner = new Runner(db)
  scheduler = new Scheduler(db, runner)
  tasks = new TaskOperations(db, () => {}, () => {}, id => scheduler.runNow(id), id => runner.cancel(id), () => {}, hooks)
})
afterEach(() => {
  for (const run of repo.listHookRuns(db, { active: true })) hooks.cancel(run.id)
  hooks.stop(); scheduler.stop(); runner.shutdown(); db.close()
  rmSync(dir, { recursive: true, force: true }); vi.unstubAllEnvs()
})

it('inherits every field independently, including activation of a globally disabled AI-only definition', () => {
  const global: TaskHook[] = [{ id: 'commit', targetId: 'ai', prompt: '{{diff}} is literal', enabled: false }]
  expect(resolveHooks(global, [{ id: 'commit', enabled: true, events: ['stopped'] }])[0]).toMatchObject({
    enabled: true, targetId: 'ai', prompt: '{{diff}} is literal', events: ['stopped']
  })
  expect(resolveHooks(global, [{ id: 'commit', targetId: '', events: [], enabled: false }])[0]).toMatchObject({ targetId: '', events: [], enabled: false })
  expect(resolveHooks(global, [{ id: 'local', kind: 'command', command: 'true' }])).toHaveLength(2)
  expect(() => validateHooks([{ id: 'system:report' }])).toThrow()
  expect(() => validateHooks([{ id: 'same' }, { id: 'same' }])).toThrow()
})

it('queues no work when only an AI is configured, then runs with project timing overrides', async () => {
  configure([{ id: 'commit', targetId: agentId, prompt: 'literal {{diff}}\n$(must not execute) `backticks`' }])
  const untouched = makeTask(db, projectId, 'disabled')
  expect(hooks.list({ taskId: untouched })).toEqual([])
  repo.updateProject(db, projectId, { taskHooks: [{ id: 'commit', enabled: true, events: ['created'] }] })
  const taskId = makeTask(db, projectId, 'enabled')
  await settled(taskId)
  const [run] = hooks.list({ taskId })
  expect(run.status).toBe('succeeded')
  expect(hooks.log(run.id).output).toBe('literal {{diff}}\n$(must not execute) `backticks`\n')
  expect(repo.listRunsByTask(db, taskId)).toHaveLength(0)
  expect(repo.getTask(db, taskId)?.sessionId).toBeNull()
}, 20_000)

it('rolls back queued hooks with the task and never launches an uncommitted event', async () => {
  configure([command(['created'], 'touch should-not-exist')])
  expect(() => inTransaction(db, () => { makeTask(db, projectId, 'rolled back'); throw new Error('rollback') })).toThrow('rollback')
  await hooks.tick()
  expect(hooks.list({})).toHaveLength(0)
  expect(existsSync(join(dir, 'should-not-exist'))).toBe(false)
}, 20_000)

it('records real transitions once and retains deleted-task history with the original prompt', async () => {
  configure([command(['created', 'queued', 'held', 'review', 'beforeComplete', 'completed', 'reopened', 'archived', 'restored', 'deleted'])])
  const taskId = makeTask(db, projectId, 'lifecycle', 2, 'draft')
  tasks.enqueueTask(taskId); tasks.enqueueTask(taskId)
  tasks.holdTask(taskId); repo.setTaskStatus(db, taskId, 'review')
  await tasks.markDone(taskId)
  tasks.reopen(taskId); tasks.archiveTask(taskId, true); tasks.archiveTask(taskId, true); tasks.archiveTask(taskId, false)
  await settled(taskId)
  await tasks.deleteTask(taskId)
  configure([])
  await settled(taskId)
  expect(hooks.list({ taskId }).map(run => run.event).reverse()).toEqual(['created', 'queued', 'held', 'review', 'beforeComplete', 'completed', 'reopened', 'review', 'archived', 'restored', 'deleted'])
  expect(hooks.list({ taskId }).every(run => run.input === 'printf ok')).toBe(true)
  expect(repo.getTask(db, taskId)).toBeNull()
}, 20_000)

it('blocks a subsequent task while stop hooks run, and never recursively triggers hooks from their exits', async () => {
  configure([command(['stopped'], 'sleep 0.2; printf stopped')])
  const first = makeTask(db, projectId, 'first')
  const run = occupy(db, first, agentId)
  repo.updateRun(db, run, { status: 'succeeded' }); repo.updateRun(db, run, { status: 'succeeded' })
  repo.setTaskStatus(db, first, 'review')
  const next = makeTask(db, projectId, 'next')
  expect(scheduler.claimNext()).toBeNull()
  expect((await scheduler.runNow(next)).ok).toBe(false)
  await settled(first)
  expect(hooks.list({ taskId: first })).toHaveLength(1)
  expect(hooks.list({ taskId: first })[0].status).toBe('succeeded')
  expect(scheduler.claimNext()?.task.id).toBe(next)
}, 20_000)

it('serializes command hooks in definition order and supplies context through environment variables', async () => {
  configure([command(['created'], 'sleep 0.1; printf A >> order', 'first'), command(['created'], 'printf B >> order; printf "%s|%s|%s" "$QUUU_TASK_ID" "$QUUU_HOOK_EVENT" "$QUUU_PROJECT"', 'second')])
  const taskId = makeTask(db, projectId, 'context')
  await settled(taskId)
  expect(readFileSync(join(dir, 'order'), 'utf8')).toBe('AB')
  expect(hooks.log(hooks.list({ taskId })[0].id).output).toBe(`${taskId}|created|test project`)
}, 20_000)

it('keeps a detached hook alive across restart and settles it without executing the command twice', async () => {
  configure([command(['created'], 'printf A >> once; sleep 0.2; printf B >> once')])
  const taskId = makeTask(db, projectId, 'restart')
  await vi.waitFor(async () => { await hooks.tick(); expect(hooks.list({ taskId })[0].status).toBe('running') })
  hooks.stop()
  hooks = new HookOperations(db, () => {}, () => dir)
  await settled(taskId)
  expect(readFileSync(join(dir, 'once'), 'utf8')).toBe('AB')
  expect(hooks.list({ taskId })[0].status).toBe('succeeded')
}, 20_000)

it('records failure and supports explicit retry and cancellation', async () => {
  configure([command(['created'], 'printf failure; exit 7')])
  const taskId = makeTask(db, projectId, 'failure')
  await settled(taskId)
  const [run] = hooks.list({ taskId })
  expect(run).toMatchObject({ status: 'failed', exitCode: 7 })
  hooks.retry(run.id)
  await settled(taskId)
  expect(hooks.list({ taskId })).toHaveLength(2)
  configure([command(['created'], 'sleep 10')])
  const slow = makeTask(db, projectId, 'cancel')
  await vi.waitFor(async () => { await hooks.tick(); expect(hooks.list({ taskId: slow })[0].status).toBe('running') })
  hooks.cancel(hooks.list({ taskId: slow })[0].id)
  expect(hooks.list({ taskId: slow })[0].status).toBe('canceled')
}, 20_000)

it('times out an unresponsive process and refuses completion when its before-complete hook fails', async () => {
  configure([{ ...command(['created'], 'sleep 10'), timeoutSeconds: 1 }])
  const taskId = makeTask(db, projectId, 'timeout', 2, 'draft')
  await settled(taskId)
  expect(hooks.list({ taskId })[0]).toMatchObject({ status: 'failed', error: 'Hook timed out.' })
  configure([command(['beforeComplete'], 'exit 9')])
  await expect(tasks.markDone(taskId)).rejects.toThrow('Completion hook')
  expect(repo.getTask(db, taskId)?.status).toBe('review')
}, 20_000)

it('commits a dirty task worktree before completion integrates and removes it', async () => {
  git('init', '-b', 'main'); git('config', 'user.name', 'Hook Test'); git('config', 'user.email', 'hook@example.test'); git('config', 'commit.gpgsign', 'false')
  writeFileSync(join(dir, '.gitignore'), 'data/\ntest.db*\n')
  writeFileSync(join(dir, 'file.txt'), 'base')
  git('add', '.gitignore', 'file.txt'); git('commit', '-m', 'initial')
  repo.updateProject(db, projectId, { worktreeMode: 'on' })
  const taskId = makeTask(db, projectId, 'commit', 2, 'draft')
  await ensureTaskWorktree(db, repo.getTask(db, taskId)!, repo.getProject(db, projectId)!, 'hook-test')
  const tree = repo.getTaskWorktree(db, taskId)!
  writeFileSync(join(tree.cwd, 'file.txt'), 'committed by hook')
  repo.setTaskStatus(db, taskId, 'review')
  configure([command(['beforeComplete'], 'git add file.txt && git commit -m "Commit from lifecycle hook"'), command(['completed'], 'pwd', 'after')])
  await tasks.markDone(taskId)
  expect(repo.getTask(db, taskId)?.status).toBe('done')
  expect(readFileSync(join(dir, 'file.txt'), 'utf8')).toBe('committed by hook')
  expect(existsSync(tree.cwd)).toBe(false)
  await settled(taskId)
  expect(hooks.list({ taskId }).find(run => run.event === 'beforeComplete')).toMatchObject({ status: 'succeeded', cwd: tree.cwd })
  expect(hooks.list({ taskId }).find(run => run.event === 'completed')).toMatchObject({ status: 'succeeded', cwd: dir })
}, 30_000)


it('keeps the built-in report request across restart and runs it after custom hooks', async () => {
  configure([command(['review'], 'sleep 0.2; printf committed > before-report')])
  repo.saveAppSettings(db, { ...repo.getAppSettings(db), reportEnabled: true })
  const report = vi.fn(() => { expect(readFileSync(join(dir, 'before-report'), 'utf8')).toBe('committed'); return Promise.resolve() })
  hooks.setReportHook(report)
  const taskId = makeTask(db, projectId, 'report', 2, 'draft')
  repo.setTaskStatus(db, taskId, 'review')
  expect(repo.pendingHookReports(db)).toEqual([taskId])
  hooks.stop()
  hooks = new HookOperations(db, () => {}, () => dir)
  hooks.setReportHook(report)
  await vi.waitFor(async () => { await hooks.tick(); expect(report).toHaveBeenCalledTimes(1) }, { timeout: 10_000 })
  expect(repo.pendingHookReports(db)).toEqual([])
  await hooks.tick()
  expect(report).toHaveBeenCalledTimes(1)
}, 20_000)

it('waits for agent capacity and renders provider messages without assigning the hook to the task session', async () => {
  const other = makeProject(db, { name: 'another project', path: dir, targetId: agentId })
  const occupied = occupy(db, makeTask(db, other, 'active'), agentId)
  repo.updateAgent(db, agentId, { logAdapter: 'claude', argsTemplate: ['{"type":"assistant","uuid":"answer","message":{"role":"assistant","content":[{"type":"text","text":"Committed the changes."}]}}'] })
  configure([{ id: 'ai', enabled: true, events: ['created'], targetId: agentId, prompt: 'Inspect the repository' }])
  const taskId = makeTask(db, projectId, 'wait')
  await hooks.tick()
  expect(hooks.list({ taskId })[0].status).toBe('queued')
  repo.updateRun(db, occupied, { status: 'succeeded' })
  await settled(taskId)
  const [run] = hooks.list({ taskId })
  expect(run.status).toBe('succeeded')
  expect(hooks.log(run.id).messages[0].blocks).toContainEqual({ kind: 'text', text: 'Committed the changes.' })
  expect(repo.getTask(db, taskId)?.sessionId).toBeNull()
  expect(repo.hasOwnHookCovering(db, dir, run.startedAt!)).toBe(true)
}, 20_000)

it('reserves agent capacity for a running hook across projects', async () => {
  repo.updateAgent(db, agentId, { command: '/bin/sh', argsTemplate: ['-c', 'sleep 0.3'] })
  configure([{ id: 'ai', enabled: true, events: ['created'], targetId: agentId, prompt: 'Inspect' }])
  const taskId = makeTask(db, projectId, 'hook')
  await vi.waitFor(async () => { await hooks.tick(); expect(hooks.list({ taskId })[0].status).toBe('running') })
  configure([])
  const other = makeProject(db, { name: 'another project', path: dir, targetId: agentId })
  const next = makeTask(db, other, 'next')
  expect(repo.countActiveRunsByAgent(db, agentId)).toBe(1)
  expect(scheduler.claimNext()).toBeNull()
  await settled(taskId)
  repo.setTaskStatus(db, taskId, 'review')
  expect(scheduler.claimNext()?.task.id).toBe(next)
}, 20_000)
