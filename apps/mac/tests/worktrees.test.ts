import { SyncFolder } from '../src/main/mobile-sync/folder.js'
import { SyncImporter } from '../src/main/mobile-sync/importIntent.js'
import { LAYOUT } from '../src/main/mobile-sync/layout.js'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { openDatabase } from '../src/main/db/database.js'
import * as repo from '../src/main/db/repo.js'
import { Runner } from '../src/main/execution/runner.js'
import { Scheduler } from '../src/main/execution/scheduler.js'
import { ProjectOperations } from '../src/main/projects/operations.js'
import { WorkspaceOperations } from '../src/main/projects/workspace.js'
import { gh } from '../src/main/review/github.js'
import { TaskOperations } from '../src/main/tasks/operations.js'
import { ensureTaskWorktree, usesWorktree } from '../src/main/tasks/worktrees.js'
import { makeAgent, makeProject, makeTask } from './helpers.js'

// Real Git processes share the machine with running agents; these are correctness checks, not latency limits.
vi.mock('../src/main/review/github.js', async importOriginal => ({ ...await importOriginal<object>(), gh: vi.fn() }))
let dir: string, root: string, db: ReturnType<typeof openDatabase>, projectId: string, taskId: string
let runner: Runner, scheduler: Scheduler, tasks: TaskOperations
function git(cwd: string, ...args: string[]): string {
  return execFileSync('/usr/bin/git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}
function commit(cwd: string, text: string, file = 'file.txt'): string {
  writeFileSync(join(cwd, file), text)
  git(cwd, 'add', file)
  git(cwd, 'commit', '-m', text)
  return git(cwd, 'rev-parse', 'HEAD')
}
function services(): void {
  runner = new Runner(db)
  scheduler = new Scheduler(db, runner)
  tasks = new TaskOperations(db, () => {}, () => {}, id => scheduler.runNow(id), id => runner.cancel(id), () => {})
}
async function prepare(id = taskId): Promise<repo.TaskWorktree> {
  const task = repo.getTask(db, id)!
  await ensureTaskWorktree(db, task, repo.getProject(db, task.projectId)!, 'test-run')
  repo.setTaskStatus(db, id, 'review')
  return repo.getTaskWorktree(db, id)!
}
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'quuu-worktrees-'))
  root = join(dir, 'repository with spaces')
  mkdirSync(root)
  vi.stubEnv('QUUU_USER_DATA', join(dir, 'data'))
  git(root, 'init', '-b', 'main')
  git(root, 'config', 'user.name', 'Worktree Test')
  git(root, 'config', 'user.email', 'worktree@example.test')
  git(root, 'config', 'commit.gpgsign', 'false')
  commit(root, 'initial')
  db = openDatabase(join(dir, 'test.db'))
  const agent = makeAgent(db, { name: 'local test', command: '/bin/sh', logAdapter: 'stdout', argsTemplate: ['-c', 'pwd > cwd.txt; printf %s "$1" > arg.txt', '--', '{{projectPath}}'] })
  projectId = makeProject(db, { name: 'repository', path: root, targetId: agent })
  repo.updateProject(db, projectId, { worktreeMode: 'on' })
  taskId = makeTask(db, projectId, 'task')
  services()
  vi.mocked(gh).mockReset()
})
afterEach(() => {
  scheduler.stop(); runner.shutdown(); if (db.isOpen) db.close()
  rmSync(dir, { recursive: true, force: true }); vi.unstubAllEnvs()
})

it('inherits the global setting and allows each project to opt in or out', () => {
  const project = repo.getProject(db, projectId)!
  repo.saveAppSettings(db, { ...repo.getAppSettings(db), worktreeEnabled: false })
  expect(usesWorktree(db, { ...project, worktreeMode: 'inherit' })).toBe(false)
  expect(usesWorktree(db, project)).toBe(true)
  repo.saveAppSettings(db, { ...repo.getAppSettings(db), worktreeEnabled: true })
  expect(usesWorktree(db, { ...project, worktreeMode: 'inherit' })).toBe(true)
  expect(usesWorktree(db, { ...project, worktreeMode: 'off' })).toBe(false)
  const projects = new ProjectOperations(db, () => {}, () => {})
  expect(projects.createProject({ name: 'configured', path: dir, worktreeMode: 'off' }).worktreeMode).toBe('off')
}, 30_000)

it('creates nothing while queued, then launches the first run and captures its baseline inside its worktree', async () => {
  expect(repo.getTaskWorktree(db, taskId)).toBeNull()
  const claim = scheduler.claimNext()!
  expect(repo.getTaskWorktree(db, taskId)).toBeNull()
  await runner.start(claim.params, claim.run)
  await vi.waitFor(() => expect(repo.getRun(db, claim.run.id)?.status).toBe('succeeded'), { timeout: 20_000 })
  const tree = repo.getTaskWorktree(db, taskId)!
  expect(readFileSync(join(tree.path, 'cwd.txt'), 'utf8').trim()).toBe(realpathSync(tree.cwd))
  expect(readFileSync(join(tree.path, 'arg.txt'), 'utf8')).toBe(tree.cwd)
  expect(existsSync(join(root, 'cwd.txt'))).toBe(false)
  expect(repo.getTaskReviewBase(db, taskId)?.cwd).toBe(tree.cwd)
  expect(repo.getRun(db, claim.run.id)?.cwd).toBe(tree.cwd)
}, 30_000)

it('keeps the same worktree after restart, settings changes, retries, and archive', async () => {
  const tree = await prepare()
  commit(tree.path, 'task work')
  tasks.archiveTask(taskId, true)
  expect(existsSync(tree.path)).toBe(true)
  expect(git(root, 'show', 'main:file.txt')).toBe('initial')
  scheduler.stop(); runner.shutdown(); db.close()
  db = openDatabase(join(dir, 'test.db')); services()
  repo.updateProject(db, projectId, { worktreeMode: 'off' })
  tasks.archiveTask(taskId, false)
  expect(await prepare()).toEqual(tree)
  const workspace = new WorkspaceOperations(db, () => repo.getAppSettings(db))
  expect(workspace.workingDir({ kind: 'task', id: taskId })?.dir).toBe(tree.cwd)
}, 30_000)

it('integrates into the default branch and removes only the completed task worktree', async () => {
  const tree = await prepare()
  const other = await prepare(makeTask(db, projectId, 'other task'))
  const head = commit(tree.path, 'completed work')
  await tasks.markDone(taskId)
  expect(repo.getTask(db, taskId)?.status).toBe('done')
  expect(git(root, 'rev-parse', 'main')).toBe(head)
  expect(readFileSync(join(root, 'file.txt'), 'utf8')).toBe('completed work')
  expect(existsSync(tree.path)).toBe(false)
  expect(existsSync(other.path)).toBe(true)
  expect(repo.getTaskWorktree(db, taskId)?.state).toBe('removed')
  expect(git(root, 'branch', '--list', tree.branch)).toBe('')
}, 30_000)

it('merges diverged clean work without checking out or dirtying the default workspace', async () => {
  const tree = await prepare()
  commit(tree.path, 'task addition', 'task.txt')
  commit(root, 'other addition', 'other.txt')
  await tasks.markDone(taskId)
  expect(git(root, 'rev-list', '--parents', '-n', '1', 'main').split(' ')).toHaveLength(3)
  expect(readFileSync(join(root, 'task.txt'), 'utf8')).toBe('task addition')
  expect(readFileSync(join(root, 'other.txt'), 'utf8')).toBe('other addition')
  expect(git(root, 'status', '--porcelain')).toBe('')
}, 30_000)

it('retains review and all work on conflict, and can complete after the task resolves it', async () => {
  const tree = await prepare()
  commit(tree.path, 'task edit')
  const base = commit(root, 'default edit')
  await expect(tasks.markDone(taskId)).rejects.toThrow()
  expect(repo.getTask(db, taskId)).toMatchObject({ status: 'review', doneAt: null })
  expect(repo.getTask(db, taskId)?.reviewNote).toContain('main')
  expect(existsSync(tree.path)).toBe(true)
  expect(git(root, 'rev-parse', 'HEAD')).toBe(base)
  expect(git(root, 'status', '--porcelain')).toBe('')
  git(tree.path, 'merge', '-s', 'ours', '--no-edit', 'main')
  await tasks.markDone(taskId)
  expect(repo.getTask(db, taskId)?.status).toBe('done')
  expect(git(root, 'show', 'main:file.txt')).toBe('task edit')
}, 30_000)

it('refuses completion with uncommitted task files or changes in the default checkout', async () => {
  const tree = await prepare()
  writeFileSync(join(tree.path, 'new.txt'), 'uncommitted')
  await expect(tasks.markDone(taskId)).rejects.toThrow()
  expect(readFileSync(join(tree.path, 'new.txt'), 'utf8')).toBe('uncommitted')
  commit(tree.path, 'saved', 'new.txt')
  writeFileSync(join(root, 'file.txt'), 'human edit')
  await expect(tasks.markDone(taskId)).rejects.toThrow()
  expect(readFileSync(join(root, 'file.txt'), 'utf8')).toBe('human edit')
  expect(existsSync(tree.path)).toBe(true)
}, 30_000)

it('discards a deleted task worktree including dirty files without merging', async () => {
  const tree = await prepare()
  commit(tree.path, 'discarded commit')
  writeFileSync(join(tree.path, 'untracked.txt'), 'discarded file')
  await tasks.deleteTask(taskId)
  expect(repo.getTask(db, taskId)).toBeNull()
  expect(existsSync(tree.path)).toBe(false)
  expect(git(root, 'show', 'main:file.txt')).toBe('initial')
}, 30_000)

it('deletes project worktrees including archived tasks without merging them', async () => {
  const tree = await prepare()
  tasks.archiveTask(taskId, true)
  await new ProjectOperations(db, () => {}, () => {}, id => tasks.deleteTask(id)).deleteProject(projectId)
  expect(existsSync(tree.path)).toBe(false)
  expect(repo.getProject(db, projectId)?.deletedAt).not.toBeNull()
}, 30_000)

it('removes an exactly merged PR worktree without changing the local default branch', async () => {
  const tree = await prepare()
  const head = commit(tree.path, 'merged through PR')
  git(root, 'remote', 'add', 'origin', 'https://github.com/example/repository.git')
  vi.mocked(gh).mockResolvedValue({ code: 0, stderr: '', stdout: JSON.stringify([{ state: 'MERGED', headRefOid: head, headRefName: tree.branch }]) })
  await tasks.markDone(taskId)
  expect(existsSync(tree.path)).toBe(false)
  expect(git(root, 'show', 'main:file.txt')).toBe('initial')
}, 30_000)

it('does not lose commits added after a merged PR', async () => {
  const tree = await prepare()
  const old = commit(tree.path, 'old merged commit')
  commit(tree.path, 'new work after merge')
  git(root, 'remote', 'add', 'origin', 'https://github.com/example/repository.git')
  vi.mocked(gh).mockResolvedValue({ code: 0, stderr: '', stdout: JSON.stringify([{ state: 'MERGED', headRefOid: old, headRefName: tree.branch }]) })
  await tasks.markDone(taskId)
  expect(git(root, 'show', 'main:file.txt')).toBe('new work after merge')
}, 30_000)

it('keeps review when GitHub cannot verify the PR and blocks overlapping task operations', async () => {
  const tree = await prepare()
  commit(tree.path, 'work')
  git(root, 'remote', 'add', 'origin', 'https://github.com/example/repository.git')
  let answer!: (value: Awaited<ReturnType<typeof gh>>) => void
  vi.mocked(gh).mockReturnValue(new Promise(resolve => { answer = resolve }))
  const completion = Promise.resolve(tasks.markDone(taskId)).then(() => null, (error: unknown) => error)
  await vi.waitFor(() => expect(gh).toHaveBeenCalled(), { timeout: 20_000 })
  expect(() => tasks.sendBack(taskId, 'more')).toThrow()
  expect(() => tasks.deleteTask(taskId)).toThrow()
  expect((await scheduler.runNow(taskId)).ok).toBe(false)
  answer({ code: 1, stdout: '', stderr: 'offline' })
  const failure = await completion
  expect(failure).toBeInstanceOf(Error)
  if (!(failure instanceof Error)) throw new Error('Expected completion to fail')
  expect(failure.message).toContain('offline')
  expect(existsSync(tree.path)).toBe(true)
  expect(repo.getTask(db, taskId)?.status).toBe('review')
}, 30_000)

it('updates an unchecked default branch without switching the project branch', async () => {
  git(root, 'switch', '-c', 'development')
  const tree = await prepare()
  commit(tree.path, 'task work')
  await tasks.markDone(taskId)
  expect(git(root, 'branch', '--show-current')).toBe('development')
  expect(git(root, 'show', 'main:file.txt')).toBe('task work')
  expect(readFileSync(join(root, 'file.txt'), 'utf8')).toBe('initial')
}, 30_000)

it('uses the remote default branch and preserves a project subdirectory', async () => {
  git(root, 'branch', '-m', 'trunk')
  mkdirSync(join(root, 'package'))
  commit(root, 'package work', 'package/file.txt')
  git(root, 'update-ref', 'refs/remotes/origin/trunk', 'HEAD')
  git(root, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/trunk')
  repo.updateProject(db, projectId, { path: join(root, 'package') })
  const tree = await prepare()
  expect(tree.defaultBranch).toBe('trunk')
  expect(tree.cwd).toBe(join(tree.path, 'package'))
  expect(readFileSync(join(tree.cwd, 'file.txt'), 'utf8')).toBe('package work')
}, 30_000)

it('does not recreate a missing active worktree and pretend its changes survived', async () => {
  const tree = await prepare()
  rmSync(tree.path, { recursive: true, force: true })
  await expect(prepare()).rejects.toThrow()
  expect(repo.getTaskWorktree(db, taskId)?.state).toBe('active')
}, 30_000)

it('recovers cleanup after the directory was removed before approval committed', async () => {
  const tree = await prepare()
  const head = commit(tree.path, 'already integrated')
  git(root, 'merge', '--ff-only', head)
  repo.saveTaskWorktree(db, { ...tree, state: 'integrated', integratedHead: head })
  git(root, 'worktree', 'remove', tree.path)
  await tasks.markDone(taskId)
  expect(repo.getTask(db, taskId)?.status).toBe('done')
  expect(repo.getTaskWorktree(db, taskId)?.state).toBe('removed')
}, 30_000)

it('reopening completed work starts a new worktree and a fresh conversation', async () => {
  const tree = await prepare()
  repo.setTaskSessionId(db, taskId, 'old-session')
  await tasks.markDone(taskId)
  tasks.reopen(taskId)
  expect(repo.getTask(db, taskId)?.sessionId).toBeNull()
  const reopened = await prepare()
  expect(reopened.path).not.toBe(tree.path)
  expect(existsSync(reopened.path)).toBe(true)
}, 30_000)

it('leaves an already started task in its recorded checkout when isolation is enabled later', async () => {
  repo.updateProject(db, projectId, { worktreeMode: 'off' })
  const claim = scheduler.claimNext()!
  repo.updateRun(db, claim.run.id, { status: 'succeeded' })
  repo.updateProject(db, projectId, { worktreeMode: 'on' })
  expect(await ensureTaskWorktree(db, repo.getTask(db, taskId)!, repo.getProject(db, projectId)!, 'next-run')).toBe(root)
  expect(repo.getTaskWorktree(db, taskId)).toBeNull()
}, 30_000)

it('reuses a worktree created before a crash while its creation record was still pending', async () => {
  const tree = await prepare()
  const head = commit(tree.path, 'survives a crash')
  repo.saveTaskWorktree(db, { ...tree, state: 'creating' })
  expect((await prepare()).state).toBe('active')
  expect(git(tree.path, 'rev-parse', 'HEAD')).toBe(head)
}, 30_000)

it('does not undo a successful approval when the post-commit notification fails', async () => {
  await prepare()
  const noisy = new TaskOperations(db, () => { throw new Error('notification failed') }, () => {}, id => scheduler.runNow(id), id => runner.cancel(id), () => {})
  await expect(noisy.markDone(taskId)).rejects.toThrow()
  expect(repo.getTask(db, taskId)?.status).toBe('done')
  expect(repo.getTaskWorktree(db, taskId)?.state).toBe('removed')
}, 30_000)

it('retains a branch with work the agent left behind when it switched branches', async () => {
  const tree = await prepare()
  const abandoned = commit(tree.path, 'not on submitted branch')
  git(tree.path, 'switch', '-c', 'agent-result', 'main')
  commit(tree.path, 'submitted work')
  await tasks.markDone(taskId)
  expect(git(root, 'rev-parse', tree.branch)).toBe(abandoned)
  expect(git(root, 'show', 'main:file.txt')).toBe('submitted work')
}, 30_000)


it('applies iPhone completion through the same merge checks and records a failed approval as a conflict', async () => {
  const tree = await prepare()
  commit(tree.path, 'phone task edit')
  commit(root, 'conflicting edit')
  const folder = new SyncFolder(join(dir, 'sync'))
  const importer = new SyncImporter(db)
  const writeDone = (id: string, seq: number): void => {
    folder.write(`${LAYOUT.intents}/${id}.json`, JSON.stringify({ version: 2, id, device: 'phone', seq,
      createdAt: new Date().toISOString(), baseRev: 1, op: { kind: 'task.done', taskId }, expect: null }))
  }
  writeDone('conflicting', 1)
  const failed = await importer.sync(folder, tasks)
  expect(failed.conflicts).toHaveLength(1)
  expect(repo.getTask(db, taskId)?.status).toBe('review')
  expect(existsSync(tree.path)).toBe(true)
  git(tree.path, 'merge', '-s', 'ours', '--no-edit', 'main')
  writeDone('resolved', 2)
  expect((await importer.sync(folder, tasks)).applied).toBe(1)
  expect(repo.getTask(db, taskId)?.status).toBe('done')
  expect(repo.appliedIntentIds(db).has('resolved')).toBe(true)
  expect((await importer.sync(folder, tasks)).applied).toBe(0)
}, 30_000)

it('waits for a running agent to exit before deleting its worktree', async () => {
  const agentId = repo.getProject(db, projectId)!.targetId!
  repo.updateAgent(db, agentId, { argsTemplate: ['-c', 'echo ready > ready.txt; sleep 30'] })
  const claim = scheduler.claimNext()!
  await runner.start(claim.params, claim.run)
  const tree = repo.getTaskWorktree(db, taskId)!
  await vi.waitFor(() => expect(existsSync(join(tree.path, 'ready.txt'))).toBe(true), { timeout: 20_000 })
  await tasks.deleteTask(taskId)
  expect(repo.getTask(db, taskId)).toBeNull()
  expect(existsSync(tree.path)).toBe(false)
  expect(runner.isLive(claim.run.id)).toBe(false)
}, 30_000)

it('sending back completed work keeps the new instruction and detaches the removed workspace session', async () => {
  await prepare()
  repo.setTaskSessionId(db, taskId, 'finished-session')
  await tasks.markDone(taskId)
  tasks.sendBack(taskId, 'next instruction')
  expect(repo.getTask(db, taskId)).toMatchObject({ status: 'queued', sessionId: null, prompt: 'task\n\nnext instruction' })
}, 30_000)
