import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Db } from '../src/main/db/database.js'
import * as repo from '../src/main/db/repo.js'
import { Runner } from '../src/main/execution/runner.js'
import { Scheduler } from '../src/main/execution/scheduler.js'
import { HookOperations } from '../src/main/hooks/operations.js'
import { ReportOperations } from '../src/main/report/operations.js'
import { RunnerOperations } from '../src/main/runners/operations.js'
import { RunnerWorker } from '../src/main/runners/worker.js'
import { pinnedRequest } from '../src/main/runners/tls.js'
import { normalizeRepository, projectRepository } from '../src/main/runners/repository.js'
import { issueToken } from '../src/main/platform/githubAuthRuntime.mjs'
import { memoryDb, makeAgent, makeProject, makeTask } from './helpers.js'

vi.mock('../src/main/platform/githubAuthRuntime.mjs', async importOriginal => ({
  ...await importOriginal<typeof import('../src/main/platform/githubAuthRuntime.mjs')>(),
  issueToken: vi.fn(() => Promise.resolve({ token: 'fixture-installation-grant', expiresAt: Date.now() + 3600_000 }))
}))

let dir: string, db: Db, remote: RunnerOperations, runner: Runner, scheduler: Scheduler
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'quuu-runners-'))
  vi.stubEnv('QUUU_USER_DATA', join(dir, 'controller'))
  vi.stubEnv('QUUU_RUNNER_AGENTS', 'bash')
  db = memoryDb()
  remote = new RunnerOperations(db, () => {})
  runner = new Runner(db, remote)
  scheduler = new Scheduler(db, runner)
  await remote.configure({ enabled: true, port: 0 })
})
afterEach(() => { scheduler.stop(); remote.stop(); runner.shutdown(); db.close(); vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }) })

async function pair() {
  const status = remote.status(), root = join(dir, 'worker')
  const url = `https://127.0.0.1:${status.port}`
  const pairing = remote.pairing()
  const body = { version: 1, pin: pairing.pin, name: 'Test Runner', root, capacity: 3,
    agents: [{ name: 'bash', command: '/bin/bash', version: 'test' }] }
  const grant = await pinnedRequest(url, pairing.fingerprint, '/pair', body) as { id: string; token: string }
  return { worker: new RunnerWorker(root, resolve('out/runner/quuu-runner.mjs'), { ...grant, url, fingerprint: status.fingerprint }), grant, url, body, fingerprint: status.fingerprint }
}
function project(script = 'printf "remote-output\\n"; printf changed > result.txt') {
  const source = join(dir, 'source')
  mkdirSync(source)
  const git = (args: string[]): string => execFileSync('git', ['-C', source, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  git(['init', '-b', 'main'])
  writeFileSync(join(source, 'README.md'), 'fixture\n')
  git(['add', '.']); git(['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'Initial'])
  git(['remote', 'add', 'origin', 'https://example.test/repository.git'])
  const agentId = makeAgent(db, { name: 'Shell', command: '/bin/bash', logAdapter: 'stdout', argsTemplate: ['-c', script], resumeArgsTemplate: ['-c', script],
    env: { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: `url.file://${source}.insteadOf`, GIT_CONFIG_VALUE_0: 'https://example.test/repository.git' } })
  const projectId = makeProject(db, { name: 'Remote project', targetId: agentId, path: source })
  repo.updateProject(db, projectId, { runnerEnabled: true })
  return { projectId, agentId, source }
}
async function until(worker: RunnerWorker, condition: () => boolean): Promise<void> {
  const deadline = Date.now() + 15_000
  while (!condition() && Date.now() < deadline) { await worker.tick(); await delay(60) }
  expect(condition()).toBe(true)
}

it('pins the controller before sending secrets and consumes a PIN only once', async () => {
  const paired = await pair()
  await expect(pinnedRequest(paired.url, '0'.repeat(64), '/pair', paired.body)).rejects.toThrow('fingerprint')
  await expect(pinnedRequest(paired.url, paired.fingerprint, '/pair', paired.body)).rejects.toThrow('403')
  await expect(pinnedRequest(paired.url, paired.fingerprint, '/poll', { version: 1, agents: [], updates: [] }, 'wrong')).rejects.toThrow('403')
  expect(JSON.stringify(remote.status())).not.toContain(paired.grant.token)
  expect(JSON.stringify(repo.listRemoteRunners(db))).not.toContain(paired.grant.token)
})

it('requires the report and hook agents before preferring a Runner', async () => {
  await pair()
  const { projectId, agentId } = project()
  const taskId = makeTask(db, projectId, 'Run remotely')
  const agent = repo.getAgent(db, agentId)!, prj = repo.getProject(db, projectId)!
  expect(remote.choose(taskId, prj, agent)?.runnerId).toBeTruthy()
  repo.saveAppSettings(db, { ...repo.getAppSettings(db), reportEnabled: true, reportTargetId: 'absent' })
  expect(remote.choose(taskId, prj, agent)).toBeNull()
  repo.saveAppSettings(db, { ...repo.getAppSettings(db), reportEnabled: false })
  expect(remote.choose(taskId, { ...prj, taskHooks: [{ id: 'h', enabled: true, events: ['review'], kind: 'agent', targetKind: 'agent', targetId: 'missing' }] }, agent)).toBeNull()
})

it('clones independently, returns logs, survives controller recovery and keeps follow-ups on the Runner', async () => {
  const { worker, grant } = await pair()
  const { projectId, source } = project('printf "remote-output\\n"; printf changed > result.txt; sleep 0.3')
  const taskId = makeTask(db, projectId, 'Remote task')
  const claim = scheduler.claimNext()!
  expect(claim.run.runnerId).toBe(grant.id)
  expect(claim.run.cwd).not.toBe(source)
  await runner.start(claim.params, claim.run)
  await worker.tick()
  scheduler.stop(); runner.shutdown()
  runner = new Runner(db, remote)
  scheduler = new Scheduler(db, runner)
  scheduler.reconcile()
  await until(worker, () => repo.getTask(db, taskId)?.status === 'review')
  const completed = repo.getRun(db, claim.run.id)!
  expect(completed.status).toBe('succeeded')
  expect(readFileSync(completed.stdoutLogPath, 'utf8')).toContain('remote-output')
  expect(readFileSync(join(completed.cwd, 'result.txt'), 'utf8')).toBe('changed')
  expect(repo.getTaskReviewBase(db, taskId)?.baseTree).toMatch(/^[a-f0-9]{40}$/)
  const snapshot = remote.inspect(taskId, 'snapshot')
  await until(worker, () => repo.listRemoteJobs(db).length === 0)
  expect(await snapshot).toMatchObject({ changes: [expect.objectContaining({ path: 'result.txt' })] })
  const registered = repo.listRemoteRunners(db)[0]
  repo.saveRemoteRunner(db, { ...registered, lastSeen: '2000-01-01T00:00:00Z' })
  repo.setTaskStatus(db, taskId, 'queued')
  expect(scheduler.claimNext()).toBeNull()
  expect(repo.listRunsByTask(db, taskId)).toHaveLength(1)
  await worker.tick()
  const followup = scheduler.claimNext()!
  expect(followup.run.runnerId).toBe(grant.id)
  expect(followup.run.cwd).toBe(completed.cwd)
  runner.cancel(followup.run.id)
  await until(worker, () => repo.getRun(db, followup.run.id)?.status === 'canceled')
}, 30_000)

it('never starts a canceled instruction even when cancellation precedes delivery', async () => {
  const { worker } = await pair()
  const { projectId } = project('exit 19')
  const taskId = makeTask(db, projectId, 'Cancel queued dispatch')
  const claim = scheduler.claimNext()!
  runner.cancel(claim.run.id)
  await until(worker, () => repo.getRun(db, claim.run.id)?.status === 'canceled')
  expect(repo.getTask(db, taskId)?.status).toBe('review')
})

it('allows a fresh clone after a proven pre-launch failure while retaining the Runner assignment', async () => {
  const { worker, grant } = await pair()
  const { projectId } = project()
  const taskId = makeTask(db, projectId, 'Retry a failed clone')
  const claim = scheduler.claimNext()!
  const job = remote.job(claim.run.id)!
  repo.saveRemoteJob(db, { ...job, spec: { ...job.spec, env: { ...job.spec.env,
    GIT_CONFIG_KEY_0: `url.file://${dir}/missing.insteadOf` } } })
  await until(worker, () => remote.job(claim.run.id)?.status === 'finished')
  expect(repo.getRun(db, claim.run.id)?.errorKind).toBe('spawn')
  const next = runner.prepare({ ...claim.params, task: repo.getTask(db, taskId)!, kind: 'initial' })
  expect(next.runnerId).toBe(grant.id)
  expect(remote.job(next.id)?.spec.createWorkspace).toBe(true)
  await until(worker, () => repo.getRun(db, next.id)?.status === 'succeeded')
}, 30_000)

it('cancels running work and does not replay a completed delivery', async () => {
  const { worker } = await pair()
  const { projectId } = project('printf started > marker; sleep 30; printf unexpected >> marker')
  makeTask(db, projectId, 'Cancel running dispatch')
  const claim = scheduler.claimNext()!
  await until(worker, () => existsSync(join(claim.run.cwd, 'marker')))
  runner.cancel(claim.run.id)
  await until(worker, () => repo.getRun(db, claim.run.id)?.status === 'canceled')
  await worker.tick()
  expect(readFileSync(join(claim.run.cwd, 'marker'), 'utf8')).toBe('started')
  expect(repo.listRunsByTask(db, claim.run.taskId)).toHaveLength(1)
}, 30_000)

it('sends repository-scoped installation credentials separately from durable instructions', async () => {
  const { grant, url, fingerprint } = await pair()
  const { projectId } = project()
  repo.updateProject(db, projectId, { gitRemote: 'https://github.com/example/fixture.git' })
  repo.saveAppSettings(db, { ...repo.getAppSettings(db), commitIdentityEnabled: true,
    commitIdentity: { appSlug: 'fixture-app', appId: '123', botUserId: '456', setupVersion: 2 } })
  makeTask(db, projectId, 'GitHub credential delivery')
  const claim = scheduler.claimNext()!
  const reply = await pinnedRequest(url, fingerprint, '/poll', { version: 1,
    agents: [{ name: 'bash', command: '/bin/bash', version: 'test' }], updates: [] }, grant.token) as {
      credentials: Record<string, { token: string; repository: string }>; jobs: unknown[]
    }
  expect(issueToken).toHaveBeenCalledWith(expect.objectContaining({ repository: 'example/fixture', appId: '123' }), expect.any(AbortSignal))
  expect(reply.credentials[claim.run.id]).toMatchObject({ token: 'fixture-installation-grant', repository: 'example/fixture' })
  expect(JSON.stringify(reply.jobs)).not.toContain('fixture-installation-grant')
  expect(JSON.stringify(remote.job(claim.run.id))).not.toContain('fixture-installation-grant')
  await expect(pinnedRequest(url, fingerprint, '/poll', { version: 1, agents: [], updates: [] }, 'another-runner')).rejects.toThrow('403')
})

it('runs ordered hooks and the report writer in the remote checkout under controller instructions', async () => {
  const { worker } = await pair()
  const { projectId, agentId } = project()
  const reporter = makeAgent(db, { name: 'Report writer', command: '/bin/bash', logAdapter: 'stdout', argsTemplate: [
    '-c', 'page=$(printf "%s" "$1" | sed -n "s/^Write the page to: //p" | head -1); printf "<html>remote report</html>" > "$page"', '_', '{{prompt}}'
  ] })
  repo.saveAppSettings(db, { ...repo.getAppSettings(db), reportEnabled: true, reportTargetId: reporter })
  repo.updateProject(db, projectId, { taskHooks: [{ id: 'commit', enabled: true, events: ['review'], kind: 'command',
    command: 'printf hook-output; printf hook > hook.txt', timeoutSeconds: 10 }] })
  const hooks = new HookOperations(db, () => {}, id => remote.workspace(id)?.cwd ?? null, remote)
  const reports = new ReportOperations(db, () => repo.getAppSettings(db), () => { throw new Error('Remote reports must not read the local checkout') }, remote)
  try {
    const taskId = makeTask(db, projectId, 'Task with remote auxiliaries')
    const claim = scheduler.claimNext()!
    expect(claim.run.agentId).toBe(agentId)
    await until(worker, () => repo.getTask(db, taskId)?.status === 'review')
    await hooks.tick()
    expect(hooks.list({ taskId })[0]?.cwd).toBe(claim.run.cwd)
    await until(worker, () => remote.job(hooks.list({ taskId })[0].id)?.status === 'finished')
    await hooks.tick()
    expect(hooks.list({ taskId })[0].status).toBe('succeeded')
    expect(readFileSync(join(claim.run.cwd, 'hook.txt'), 'utf8')).toBe('hook')
    let requested = false
    const started = reports.generate(taskId).then(result => { expect(result.ok).toBe(true); requested = true })
    await until(worker, () => requested)
    await started
    await until(worker, () => { reports.settle(); return reports.report(taskId)?.status === 'ready' })
    expect(readFileSync(reports.report(taskId)!.path, 'utf8')).toContain('remote report')
    expect(repo.getTask(db, taskId)?.status).toBe('review')
  } finally { hooks.stop(); reports.stop() }
}, 30_000)

it('prepares the independent checkout once before a started hook joins a running task', async () => {
  const { worker } = await pair()
  const { projectId } = project('for i in $(seq 1 100); do [ -f hook.ready ] && break; sleep 0.1; done; cat hook.ready')
  const bin = join(dir, 'bin')
  mkdirSync(bin)
  writeFileSync(join(bin, 'git'), '#!/bin/sh\nif [ "$1" = clone ]; then sleep 0.5; fi\nexec /usr/bin/git "$@"\n')
  chmodSync(join(bin, 'git'), 0o755)
  vi.stubEnv('PATH', `${bin}:${process.env.PATH}`)
  repo.updateProject(db, projectId, { taskHooks: [{ id: 'started', enabled: true, events: ['started'],
    kind: 'command', command: 'printf ready > hook.ready', timeoutSeconds: 10 }] })
  const hooks = new HookOperations(db, () => {}, id => remote.workspace(id)?.cwd ?? null, remote)
  try {
    const taskId = makeTask(db, projectId, 'Concurrent start hook')
    const claim = scheduler.claimNext()!
    await until(worker, () => hooks.list({ taskId }).length === 1)
    await hooks.tick()
    expect(hooks.list({ taskId })).toHaveLength(1)
    await until(worker, () => repo.getTask(db, taskId)?.status === 'review')
    await until(worker, () => remote.job(hooks.list({ taskId })[0].id)?.status === 'finished')
    await hooks.tick()
    expect(repo.getRun(db, claim.run.id)?.status, JSON.stringify(remote.job(claim.run.id)?.result)).toBe('succeeded')
    expect(hooks.list({ taskId })[0].status, hooks.list({ taskId })[0].error).toBe('succeeded')
    expect(readFileSync(claim.run.stdoutLogPath, 'utf8')).toContain('ready')
  } finally { hooks.stop() }
}, 30_000)

it('extracts SSH GitHub remotes and refuses credential-bearing or local transports', () => {
  expect(normalizeRepository('git@github.com:owner/repo.git')).toBe('https://github.com/owner/repo.git')
  for (const remote of ['file:///tmp/repository', '/tmp/repository', 'https://user:password@github.com/owner/repo', 'ext::command']) {
    expect(() => normalizeRepository(remote)).toThrow()
  }
  const { source } = project()
  expect(projectRepository(source)).toEqual({ repository: 'https://example.test/repository.git', subdirectory: '' })
})
