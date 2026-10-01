import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
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
import { RunnerOperations, runnerLaunchCommand } from '../src/main/runners/operations.js'
import type { StartLocalLogin } from '../src/main/runners/localLogin.js'
import type { SecretStore } from '../src/main/platform/secretStore.js'
import { RunnerWorker } from '../src/main/runners/worker.js'
import { pinnedRequest } from '../src/main/runners/tls.js'
import { normalizeRepository, projectRepository } from '../src/main/runners/repository.js'
import { configuredRunnerLabels } from '../src/main/runners/labels.js'
import { issueToken } from '../src/main/platform/githubAuthRuntime.mjs'
import { memoryDb, makeAgent, makeProject, makeTask } from './helpers.js'

vi.mock('../src/main/platform/githubAuthRuntime.mjs', async importOriginal => ({
  ...await importOriginal<typeof import('../src/main/platform/githubAuthRuntime.mjs')>(),
  issueToken: vi.fn(() => Promise.resolve({ token: 'fixture-installation-grant', expiresAt: Date.now() + 3600_000 }))
}))

let dir: string, db: Db, remote: RunnerOperations, runner: Runner, scheduler: Scheduler
let secrets: Map<string, string>, login: StartLocalLogin
const store: SecretStore = {
  read: account => Promise.resolve(secrets.get(account) ?? null),
  write: (account, value) => { secrets.set(account, value); return Promise.resolve() },
  remove: account => { secrets.delete(account); return Promise.resolve() }
}
beforeEach(async () => {
  secrets = new Map()
  login = () => { throw new Error('No sign-in expected') }
  dir = mkdtempSync(join(tmpdir(), 'quuu-runners-'))
  vi.stubEnv('QUUU_USER_DATA', join(dir, 'controller'))
  vi.stubEnv('QUUU_RUNNER_AGENTS', 'bash')
  vi.stubEnv('QUUU_RUNNER_LABELS', '')
  db = memoryDb()
  remote = new RunnerOperations(db, () => {}, { secrets: store, login: (agent, command) => login(agent, command) })
  runner = new Runner(db, remote)
  scheduler = new Scheduler(db, runner)
  await remote.configure({ enabled: true, port: 0 })
})
afterEach(() => { scheduler.stop(); remote.stop(); runner.shutdown(); db.close(); vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }) })

async function pair(labels?: string[]) {
  const status = remote.status(), root = join(dir, 'worker')
  const url = `https://127.0.0.1:${status.port}`
  const pairing = remote.pairing()
  const body = { version: 1, pin: pairing.pin, name: 'Test Runner', root, capacity: 3,
    ...(labels ? { labels } : {}),
    agents: [{ name: 'bash', command: '/bin/bash', version: 'test' }] }
  const grant = await pinnedRequest(url, pairing.fingerprint, '/pair', body) as { id: string; token: string }
  return { worker: new RunnerWorker(root, resolve('out/runner/quuu-runner.mjs'), { ...grant, url, fingerprint: status.fingerprint }), grant, url, body, fingerprint: status.fingerprint }
}
/** An executable on PATH that answers `--version` and otherwise runs its arguments with bash. */
function fakeCli(name: string): void {
  const bin = join(dir, 'bin')
  mkdirSync(bin, { recursive: true })
  writeFileSync(join(bin, name), '#!/bin/bash\nif [ "$1" = --version ]; then echo test; exit 0; fi\nexec /bin/bash "$@"\n')
  chmodSync(join(bin, name), 0o755)
  if (!process.env.PATH?.startsWith(bin)) vi.stubEnv('PATH', `${bin}:${process.env.PATH}`)
}
function project(script = 'printf "remote-output\\n"; printf changed > result.txt', command = '/bin/bash') {
  const source = join(dir, 'source')
  mkdirSync(source)
  const git = (args: string[]): string => execFileSync('git', ['-C', source, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  git(['init', '-b', 'main'])
  writeFileSync(join(source, 'README.md'), 'fixture\n')
  git(['add', '.']); git(['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'Initial'])
  git(['remote', 'add', 'origin', 'https://example.test/repository.git'])
  const agentId = makeAgent(db, { name: 'Shell', command, logAdapter: 'stdout', argsTemplate: ['-c', script], resumeArgsTemplate: ['-c', script],
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

it('selects only Runners with every project label and ranks agents by that same requirement', async () => {
  const unlabelled = await pair()
  const rust = await pair(['rust', 'linux'])
  const { projectId, agentId } = project()
  const taskId = makeTask(db, projectId, 'Rust task')
  const agent = repo.getAgent(db, agentId)!
  const prj = repo.updateProject(db, projectId, { runnerLabels: ['rust', 'linux'] })
  expect(remote.choose(taskId, prj, agent)?.runnerId).toBe(rust.grant.id)
  expect(remote.chooseForHook(taskId, prj, agent)?.runnerId).toBe(rust.grant.id)
  expect(remote.rankAgent(taskId, prj, agent)).toBe(0)
  const unavailable = { ...prj, runnerLabels: ['rust', 'windows'] }
  expect(remote.choose(taskId, unavailable, agent)).toBeNull()
  expect(remote.chooseForHook(taskId, unavailable, agent)).toBeNull()
  expect(remote.rankAgent(taskId, unavailable, agent)).toBe(1)
  expect(remote.choose(taskId, { ...prj, runnerLabels: [] }, agent)?.runnerId).toBe(unlabelled.grant.id)
  expect(remote.choose(taskId, { ...prj, runnerLabels: ['Rust'] }, agent)).toBeNull()
})

it('updates advertised labels on reconnect and removes them when an older worker reconnects', async () => {
  const { worker, grant, url, fingerprint, body } = await pair(['rust'])
  expect(remote.status().runners[0].labels).toEqual(['rust'])
  vi.stubEnv('QUUU_RUNNER_LABELS', 'rust, linux, rust,')
  await worker.tick()
  expect(remote.status().runners[0].labels).toEqual(['rust', 'linux'])
  await pinnedRequest(url, fingerprint, '/poll', { version: 1, agents: body.agents, updates: [] }, grant.token)
  expect(remote.status().runners[0].labels).toEqual([])
  await expect(pinnedRequest(url, fingerprint, '/poll', { version: 1, labels: ['bad label'], agents: [], updates: [] }, grant.token)).rejects.toThrow('403')
  vi.stubEnv('QUUU_RUNNER_LABELS', 'bad label')
  expect(() => configuredRunnerLabels()).toThrow()
})

it('keeps an assigned workspace on its original Runner after project labels change', async () => {
  const original = await pair(['rust'])
  await pair(['python'])
  const { projectId, agentId } = project()
  const taskId = makeTask(db, projectId, 'Existing conversation')
  const agent = repo.getAgent(db, agentId)!
  const prj = repo.updateProject(db, projectId, { runnerLabels: ['rust'] })
  const workspace = remote.choose(taskId, prj, agent)!
  remote.reserve(workspace)
  const updated = { ...prj, runnerLabels: ['python'] }
  expect(remote.choose(taskId, updated, agent)).toEqual(workspace)
  expect(remote.chooseForHook(taskId, updated, agent)).toEqual(workspace)
  const registered = repo.listRemoteRunners(db).find(item => item.id === original.grant.id)!
  repo.saveRemoteRunner(db, { ...registered, lastSeen: '2000-01-01T00:00:00Z' })
  expect(() => remote.choose(taskId, updated, agent)).toThrow()
  expect(remote.rankAgent(taskId, updated, agent)).toBe(1)
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

it('lends a saved agent token only to that agent\'s unstarted job and keeps it out of every journal', async () => {
  fakeCli('claude')
  vi.stubEnv('QUUU_RUNNER_AGENTS', 'claude')
  vi.stubEnv('CLAUDE_CODE_OAUTH_TOKEN', '')
  vi.stubEnv('QUUU_RUNNER_SECRETS', join(dir, 'tmpfs'))
  const { worker } = await pair()
  await worker.tick()
  const { projectId } = project('printf "token-length=%s\\n" "${#CLAUDE_CODE_OAUTH_TOKEN}"', 'claude')
  const token = 'sk-ant-oat01-fixture-token-value'
  const saved = await remote.setCredential({ agent: 'claude', value: token })
  expect(saved.credentials).toContainEqual({ agent: 'claude', variable: 'CLAUDE_CODE_OAUTH_TOKEN', configured: true })
  expect(saved.runners[0].agents[0].auth).toBe('quuu')
  expect(JSON.stringify(saved)).not.toContain(token)
  const taskId = makeTask(db, projectId, 'Borrow the Claude token')
  const claim = scheduler.claimNext()!
  await until(worker, () => repo.getTask(db, taskId)?.status === 'review')
  await until(worker, () => repo.listRemoteJobs(db).length === 0)
  expect(readFileSync(repo.getRun(db, claim.run.id)!.stdoutLogPath, 'utf8')).toContain(`token-length=${token.length}`)
  const journal = join(dir, 'worker', 'jobs', claim.run.id)
  for (const file of readdirSync(journal)) expect(readFileSync(join(journal, file), 'utf8')).not.toContain(token)
  expect(JSON.stringify(remote.job(claim.run.id))).not.toContain(token)
  expect(existsSync(join(dir, 'tmpfs', claim.run.id))).toBe(false)
  expect(repo.getSetting(db, 'runners.credentials')).not.toContain(token)
  await remote.setCredential({ agent: 'claude', value: '' })
  expect(secrets.has('claude')).toBe(false)
  await expect(remote.setCredential({ agent: 'claude', value: 'has spaces in it but long' })).rejects.toThrow()
}, 30_000)

it('routes away from a Runner whose agent is not signed in unless Quuu lends a token', async () => {
  const { url, fingerprint, grant } = await pair()
  const { projectId, agentId } = project('true', 'claude')
  const poll = (signedIn: boolean) => pinnedRequest(url, fingerprint, '/poll', { version: 1, updates: [],
    agents: [{ name: 'claude', command: 'claude', version: 'test', signedIn }] }, grant.token)
  await poll(false)
  const taskId = makeTask(db, projectId, 'Needs a signed-in agent')
  const agent = repo.getAgent(db, agentId)!, prj = repo.getProject(db, projectId)!
  expect(remote.status().runners[0].agents[0].auth).toBe('missing')
  expect(remote.choose(taskId, prj, agent)).toBeNull()
  await poll(true)
  expect(remote.status().runners[0].agents[0].auth).toBe('runner')
  expect(remote.choose(taskId, prj, agent)?.runnerId).toBe(grant.id)
  await poll(false)
  await remote.setCredential({ agent: 'claude', value: 'sk-ant-oat01-fixture-token-value' })
  expect(remote.choose(taskId, prj, agent)?.runnerId).toBe(grant.id)
})

it('hands a login minted for one Runner over once and forgets it after the Runner confirms', async () => {
  fakeCli('codex')
  vi.stubEnv('QUUU_RUNNER_AGENTS', 'bash,codex')
  vi.stubEnv('CODEX_HOME', join(dir, 'codex-home'))
  vi.stubEnv('OPENAI_API_KEY', '')
  vi.stubEnv('CODEX_API_KEY', '')
  const { worker } = await pair()
  await worker.tick()
  expect(remote.status().runners[0].agents.find(agent => agent.name === 'codex')?.auth).toBe('missing')
  const credential = JSON.stringify({ tokens: { refresh_token: 'runner-only-refresh' } })
  const commands: string[] = []
  login = (_agent, command) => { commands.push(command); return { url: Promise.resolve('https://auth.example.test/authorize'), credential: Promise.resolve(credential), cancel() {} } }
  const started = await remote.signIn({ runnerId: remote.status().runners[0].id, agent: 'codex' })
  expect(commands).toEqual(['codex'])
  expect(started.runners[0].login).toMatchObject({ agent: 'codex', url: 'https://auth.example.test/authorize' })
  expect(JSON.stringify(started)).not.toContain('runner-only-refresh')
  await until(worker, () => !remote.status().runners[0].login)
  const file = join(dir, 'codex-home', 'auth.json')
  expect(readFileSync(file, 'utf8')).toBe(credential)
  expect(statSync(file).mode & 0o777).toBe(0o600)
  await until(worker, () => remote.status().runners[0].agents.find(agent => agent.name === 'codex')?.auth === 'runner')
})

it('fills the start command with the controller values and persistent agent homes', () => {
  const command = runnerLaunchCommand('https://192.0.2.1:47833', 'ab'.repeat(32), '01234567', 'beef')
  expect(command).toContain('-e QUUU_CONTROLLER_URL=https://192.0.2.1:47833')
  expect(command).toContain(`-e QUUU_CONTROLLER_FINGERPRINT=${'ab'.repeat(32)}`)
  expect(command).toContain('-e QUUU_RUNNER_PIN=01234567')
  expect(command).toContain('source=quuu-runner-beef-codex,target=/home/node/.codex')
  expect(command).toContain('--tmpfs /run/quuu-runner:uid=1000,gid=1000,mode=0700')
})
