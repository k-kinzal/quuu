import { execFileSync } from 'node:child_process'
import { generateKeyPairSync } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as auth from '../src/main/platform/githubAuth.js'
import * as repo from '../src/main/db/repo.js'
import { runExitPath } from '../src/main/appPaths.js'
import { Runner } from '../src/main/execution/runner.js'
import { gh } from '../src/main/review/github.js'
import { killProcessGroup } from '../src/main/platform/runProcess.js'
import { makeAgent, makeProject, makeTask, memoryDb } from './helpers.js'

let workdir: string
let server: Server
let runner: Runner
let authDir: string
let pid: number | null
let status: number
let requests: number
let tokens: number
let tokenLifetime: number
const issuedBodies: string[] = []

beforeEach(async () => {
  workdir = mkdtempSync(join(tmpdir(), 'quuu-auth-run-'))
  process.env.QUUU_USER_DATA = workdir
  pid = null
  status = 200
  requests = 0
  tokens = 0
  tokenLifetime = 15 * 60 * 1000 + 1000
  issuedBodies.length = 0
  const pem = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  const security = join(workdir, 'security')
  writeFileSync(security, `#!/bin/sh\nprintf '%s' '${Buffer.from(pem).toString('base64')}'\n`, { mode: 0o700 })
  server = createServer((req, res) => {
    requests++
    if (status !== 200) {
      res.writeHead(status).end('{"message":"unavailable"}')
    } else if (req.method === 'POST') {
      let body = ''
      req.on('data', (chunk: Buffer) => { body += chunk.toString() })
      req.on('end', () => {
        issuedBodies.push(body)
        const lifetime = tokens === 0 ? tokenLifetime : 60 * 60 * 1000
        res.writeHead(201).end(JSON.stringify({ token: `quuu-invalid-${++tokens}`, expires_at: new Date(Date.now() + lifetime).toISOString() }))
      })
    } else {
      res.writeHead(200).end('{"id":1234}')
    }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing test server port')
  const prepare = auth.prepareGitHubAuthEnvironment
  vi.spyOn(auth, 'prepareGitHubAuthEnvironment').mockImplementation((...args) => {
    const prepared = prepare(...args)
    authDir = prepared.dir!
    const script = join(authDir, 'runtime.mjs')
    // Exercise the real detached supervisor with a local issuer and an isolated
    // fake Keychain. No production test switches and no network/personal secrets.
    const source = readFileSync(script, 'utf8')
      .replace("'https://api.github.com'", JSON.stringify(`http://127.0.0.1:${address.port}`))
      .replace("'/usr/bin/security'", JSON.stringify(security))
      .replace('const RETRY_MS = 60 * 1000', 'const RETRY_MS = 100')
      .replace('const POLL_MS = 60 * 1000', 'const POLL_MS = 50')
    writeFileSync(script, source)
    return prepared
  })
  execFileSync('/usr/bin/git', ['init', workdir], { stdio: 'ignore' })
  execFileSync('/usr/bin/git', ['-C', workdir, 'remote', 'add', 'origin', 'git@github.com:acme/query-kit.git'])
})

afterEach(async () => {
  runner?.shutdown()
  if (pid) killProcessGroup(pid, 'SIGKILL')
  vi.restoreAllMocks()
  await new Promise<void>((resolve) => server.close(() => resolve()))
  if (authDir) auth.cleanupGitHubAuth(authDir)
  rmSync(workdir, { recursive: true, force: true })
  delete process.env.QUUU_USER_DATA
})

async function start(command: string) {
  const db = memoryDb()
  runner = new Runner(db)
  const agentId = makeAgent(db, {
    name: 'probe', command: '/bin/sh', argsTemplate: ['-c', command],
    env: { GH_TOKEN: 'human-token', GITHUB_TOKEN: 'human-github-token' }
  })
  const projectId = makeProject(db, {
    name: 'auth', path: workdir, targetId: agentId, commitIdentityMode: 'custom',
    commitIdentity: { appSlug: 'quuu-test', botUserId: '999', appId: '123', setupVersion: 2 }
  })
  const taskId = makeTask(db, projectId, 'auth probe')
  const run = await runner.start({
    task: repo.getTask(db, taskId)!, project: repo.getProject(db, projectId)!, agent: repo.getAgent(db, agentId)!,
    groupId: null, kind: 'initial', fallbackFromRunId: null
  })
  pid = run.pid
  return { ...run, db }
}

function hosts(): string {
  return readFileSync(join(authDir, 'config', 'hosts.yml'), 'utf8')
}

function waitFor(assertion: () => void): Promise<void> {
  return vi.waitFor(assertion, { timeout: 5000 })
}

const waitingAgent = "env | /usr/bin/grep -E '^(GH_CONFIG_DIR|GH_REPO|GH_TOKEN|GITHUB_TOKEN|ELECTRON_RUN_AS_NODE)='; touch started; while [ ! -f finish ]; do sleep 0.05; done; exit 7"

describe('detached GitHub App authentication', () => {
  it('also authenticates Review commands before invoking native gh', async () => {
    const db = memoryDb()
    const agentId = makeAgent(db, { name: 'unused' })
    const projectId = makeProject(db, {
      name: 'review', path: workdir, targetId: agentId, commitIdentityMode: 'custom',
      commitIdentity: { appSlug: 'quuu-test', botUserId: '999', appId: '123', setupVersion: 2 }
    })
    const result = await gh(workdir, repo.getProject(db, projectId)!, repo.getAppSettings(db), ['auth', 'token', '--hostname', 'github.com'])
    expect(result.code).toBe(0)
    expect(result.stdout.trim() === 'quuu-invalid-1').toBe(true)
    expect(existsSync(authDir)).toBe(false)
  })

  it('starts authenticated, refreshes after Quuu quits, and cleans up with the agent exit code', async () => {
    const run = await start(waitingAgent)
    await waitFor(() => expect(existsSync(join(workdir, 'started'))).toBe(true))
    expect(hosts()).toContain('quuu-invalid-1')
    const log = readFileSync(run.stdoutLogPath, 'utf8')
    expect(log).toContain(`GH_CONFIG_DIR=${join(authDir, 'config')}`)
    expect(log).toContain('GH_REPO=acme/query-kit')
    expect(log).not.toMatch(/human-token|human-github-token|ELECTRON_RUN_AS_NODE=|quuu-invalid-1/)
    runner.shutdown()
    await waitFor(() => expect(tokens).toBeGreaterThanOrEqual(2))
    await waitFor(() => expect(hosts()).toContain('quuu-invalid-2'))
    expect(issuedBodies.map((body) => JSON.parse(body) as unknown)).toEqual([
      { repositories: ['query-kit'] }, { repositories: ['query-kit'] }
    ])
    writeFileSync(join(workdir, 'finish'), '')
    await waitFor(() => expect(existsSync(runExitPath(run.id))).toBe(true))
    expect(readFileSync(runExitPath(run.id), 'utf8')).toBe('7')
    expect(existsSync(authDir)).toBe(false)
  })

  it('retains the token on refresh failure and replaces it when GitHub recovers', async () => {
    await start(waitingAgent)
    await waitFor(() => expect(existsSync(join(workdir, 'started'))).toBe(true))
    const before = hosts()
    status = 503
    await waitFor(() => expect(requests).toBeGreaterThanOrEqual(4))
    expect(hosts()).toBe(before)
    status = 200
    await waitFor(() => expect(hosts()).toContain('quuu-invalid-2'))
    writeFileSync(join(workdir, 'finish'), '')
    await waitFor(() => expect(existsSync(authDir)).toBe(false))
  })

  it.each(['expiration', 'authentication'])('never launches the agent if initial %s validation fails', async (failure) => {
    if (failure === 'expiration') tokenLifetime = -1000
    else status = 401
    const run = await start('touch started')
    await waitFor(() => expect(repo.getRun(run.db, run.id)?.exitCode).toBe(1))
    expect(existsSync(join(workdir, 'started'))).toBe(false)
    expect(existsSync(authDir)).toBe(false)
    expect(readFileSync(run.stdoutLogPath, 'utf8')).toContain(failure === 'expiration'
      ? 'invalid installation token or expiration'
      : 'GitHub App authentication failed')
  })

  it('stops refreshing and removes private credentials when canceled after a Quuu restart', async () => {
    const run = await start(waitingAgent)
    await waitFor(() => expect(existsSync(join(workdir, 'started'))).toBe(true))
    runner.shutdown()
    runner = new Runner(run.db)
    runner.cancel(run.id)
    await waitFor(() => expect(existsSync(authDir)).toBe(false))
    const count = requests
    await new Promise((resolve) => setTimeout(resolve, 1200))
    expect(requests).toBe(count)
  })

  it('keeps credentials until an agent that delays cancellation actually exits', async () => {
    const run = await start(`trap '' TERM; ${waitingAgent}`)
    await waitFor(() => expect(existsSync(join(workdir, 'started'))).toBe(true))
    const before = hosts()
    runner.cancel(run.id)
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(hosts()).toBe(before)
    writeFileSync(join(workdir, 'finish'), '')
    await waitFor(() => expect(existsSync(authDir)).toBe(false))
  })
})
