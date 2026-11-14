import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { BoundedOutput, OUTPUT_MAX_BYTES, outputSnapshot, writeOutputSnapshot } from '../src/main/platform/boundedOutput.mjs'
import { capturedLaunch } from '../src/main/platform/detachedLaunch.js'
import { killProcessGroup } from '../src/main/platform/runProcess.js'
import { OutputCleanup } from '../src/main/execution/outputCleanup.js'
import { SessionIndex, sessionKey } from '../src/main/session/index.js'
import { sessionReadTarget } from '../src/main/session/sessionAttach.js'
import * as repo from '../src/main/db/repo.js'
import { isolateSessionDirs, makeAgent, makeProject, makeTask, memoryDb, occupy, releaseSessionDirs } from './helpers.js'

let root: string
const children = new Set<number>()
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'quuu-output-'))
  vi.stubEnv('QUUU_USER_DATA', root)
  isolateSessionDirs(root)
  mkdirSync(join(root, 'logs'))
})
afterEach(() => {
  for (const pid of children) killProcessGroup(pid, 'SIGKILL')
  children.clear()
  releaseSessionDirs()
  vi.unstubAllEnvs()
  rmSync(root, { recursive: true, force: true })
})

it('keeps the session announcement and final error within a fixed bound despite large output', () => {
  const output = new BoundedOutput()
  output.append('session id: example\n')
  const chunk = Buffer.alloc(1024 * 1024, 'x')
  for (let i = 0; i < 200; i++) output.append(chunk)
  output.append('\nusage limit reached\n')
  expect(output.snapshot().byteLength).toBeLessThanOrEqual(OUTPUT_MAX_BYTES)
  expect(output.snapshot().toString()).toContain('session id: example')
  expect(output.snapshot().toString()).toContain('Intermediate execution output omitted')
  expect(output.snapshot().toString()).toMatch(/usage limit reached\n$/)
})

it('continues collecting with bounded disk usage after the launching process exits', async () => {
  const log = join(root, 'logs', 'run_test.log'), exit = join(root, 'run.exit')
  const program = `const fs = require('node:fs'); fs.writeSync(1, 'session id: before-restart\\n');
    setTimeout(() => { const chunk = Buffer.alloc(65536, 'x'); for (let i=0;i<1024;i++) fs.writeSync(1,chunk);
      fs.writeSync(2,'\\nClaude usage limit reached\\n'); process.exit(3) }, 200)`
  const launch = capturedLaunch([process.execPath, '-e', program], log)
  const parent = `const cp = require('node:child_process'); const spec = JSON.parse(process.argv[1]);
    const child = cp.spawn(spec.command, spec.args, {detached:true,stdio:'ignore',env:{...process.env,...spec.env}});
    console.log(child.pid); child.unref()`
  const pid = Number(execFileSync(process.execPath, ['-e', parent, JSON.stringify(launch)], {
    encoding: 'utf8', env: { ...process.env, QUUU_EXIT_FILE: exit }
  }).trim())
  children.add(pid)
  const deadline = Date.now() + 10_000
  while (!existsSync(exit) && Date.now() < deadline) {
    for (const file of [log, log + '.tmp']) if (existsSync(file)) {
      try { expect(statSync(file).size).toBeLessThanOrEqual(OUTPUT_MAX_BYTES) } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    }
    await delay(10)
  }
  expect(readFileSync(exit, 'utf8')).toBe('3')
  const text = readFileSync(log, 'utf8')
  expect(text).toContain('session id: before-restart')
  expect(text).toMatch(/Claude usage limit reached\n$/)
}, 15_000)

it('settles the agent even when a background grandchild keeps stdout open', async () => {
  const log = join(root, 'logs', 'run_background.log'), exit = join(root, 'run.exit')
  const launch = capturedLaunch(['/bin/sh', '-c', 'sleep 30 & echo finished; exit 7'], log)
  const child = spawn(launch.command, launch.args, { detached: true, stdio: 'ignore', env: { ...process.env, ...launch.env, QUUU_EXIT_FILE: exit } })
  children.add(child.pid!)
  await vi.waitFor(() => { expect(existsSync(exit)).toBe(true) }, { timeout: 3000 })
  expect(readFileSync(exit, 'utf8')).toBe('7')
  expect(readFileSync(log, 'utf8')).toContain('finished')
})

it('releases completed receipts, preserves saved chat, and leaves active runs and provider files alone', async () => {
  const db = memoryDb(), index = new SessionIndex(db), cleanup = new OutputCleanup(db, index)
  const agent = makeAgent(db, { name: 'stdout', logAdapter: 'stdout' })
  const project = makeProject(db, { name: 'project', targetId: agent, path: root })
  const task = makeTask(db, project, 'task')
  const path = join(root, 'logs', 'run_saved.log')
  const id = occupy(db, task, agent, { id: 'run_saved', stdoutLogPath: path })
  repo.updateRun(db, id, { status: 'succeeded', endedAt: new Date().toISOString() })
  writeFileSync(path, 'saved conversation\n')
  const run = repo.getRun(db, id)!, target = sessionReadTarget(db, run)
  index.request(run, target)
  await index.ready(sessionKey(target))
  const saved = index.page(target)
  // Legacy receipt changed after indexing; retiring it must not overwrite existing chat.
  writeFileSync(path, 'old console output'.repeat(1_000_000))
  const active = join(root, 'logs', 'run_active.log')
  occupy(db, makeTask(db, project, 'active'), agent, { id: 'run_active', stdoutLogPath: active })
  writeFileSync(active, 'still running')
  const provider = join(root, 'codex', 'transcript.jsonl')
  mkdirSync(join(root, 'codex'))
  writeFileSync(provider, 'provider conversation')
  await cleanup.sweep()
  expect(existsSync(path)).toBe(false)
  expect(index.page(target).messages).toEqual(saved.messages)
  expect(existsSync(active)).toBe(true)
  expect(readFileSync(provider, 'utf8')).toBe('provider conversation')
  cleanup.stop(); index.stop(); await index.settled(); db.close()
})

it('stores only a bounded stdout conversation before discarding a completed unindexed receipt', async () => {
  const db = memoryDb(), index = new SessionIndex(db), cleanup = new OutputCleanup(db, index)
  const agent = makeAgent(db, { name: 'stdout', logAdapter: 'stdout' })
  const project = makeProject(db, { name: 'project', targetId: agent, path: root })
  const path = join(root, 'logs', 'run_bounded.log')
  const id = occupy(db, makeTask(db, project, 'task'), agent, { id: 'run_bounded', stdoutLogPath: path })
  repo.updateRun(db, id, { status: 'succeeded', endedAt: new Date().toISOString() })
  writeFileSync(path, 'start\n' + 'x'.repeat(2_000_000) + '\nend')
  expect(outputSnapshot(path).length).toBeLessThanOrEqual(OUTPUT_MAX_BYTES)
  await cleanup.sweep()
  expect(existsSync(path)).toBe(false)
  const page = index.page(sessionReadTarget(db, repo.getRun(db, id)!))
  expect(JSON.stringify(page.messages)).toContain('start')
  expect(JSON.stringify(page.messages)).toContain('end')
  expect(JSON.stringify(page.messages).length).toBeLessThan(OUTPUT_MAX_BYTES + 2000)
  cleanup.stop(); index.stop(); await index.settled(); db.close()
})

it('replaces a bounded stdout snapshot without accumulating previous versions in chat', async () => {
  const db = memoryDb(), index = new SessionIndex(db)
  const agent = makeAgent(db, { name: 'stdout', logAdapter: 'stdout' })
  const project = makeProject(db, { name: 'project', targetId: agent, path: root })
  const path = join(root, 'logs', 'run_snapshot.log')
  const id = occupy(db, makeTask(db, project, 'task'), agent, { id: 'run_snapshot', stdoutLogPath: path })
  const run = repo.getRun(db, id)!, target = sessionReadTarget(db, run)
  for (const text of ['earlier', 'latest']) {
    const output = new BoundedOutput(); output.append(text); writeOutputSnapshot(path, output.snapshot())
    index.request(run, target); await index.ready(sessionKey(target))
  }
  expect(JSON.stringify(index.page(target).messages)).toContain('latest')
  expect(JSON.stringify(index.page(target).messages)).not.toContain('earlier')
  index.stop(); await index.settled(); db.close()
})

it('keeps native chat readable when both runtime output and the original provider transcript are gone', async () => {
  const db = memoryDb(), index = new SessionIndex(db), cleanup = new OutputCleanup(db, index)
  const agent = makeAgent(db, { name: 'Claude', logAdapter: 'claude' })
  const project = makeProject(db, { name: 'project', targetId: agent, path: root })
  const path = join(root, 'logs', 'run_native.log')
  const id = occupy(db, makeTask(db, project, 'task'), agent, { id: 'run_native', stdoutLogPath: path })
  const provider = join(root, 'conversation.jsonl')
  writeFileSync(provider, JSON.stringify({ type: 'assistant', uuid: 'reply', message: { content: [{ type: 'text', text: 'Kept conversation' }] } }) + '\n')
  writeFileSync(path, 'unneeded raw console')
  const run = repo.updateRun(db, id, { status: 'succeeded', endedAt: new Date().toISOString(), sessionLogPath: provider })
  const target = sessionReadTarget(db, run)
  index.request(run, target); await index.ready(sessionKey(target))
  await cleanup.sweep()
  expect(existsSync(path)).toBe(false)
  expect(existsSync(provider)).toBe(true)
  rmSync(provider)
  index.request(run, target); await index.ready(sessionKey(target))
  expect(JSON.stringify(index.page(target).messages)).toContain('Kept conversation')
  cleanup.stop(); index.stop(); await index.settled(); db.close()
})

it('releases partial snapshots and exit receipts after their owner has settled', async () => {
  const db = memoryDb(), index = new SessionIndex(db), cleanup = new OutputCleanup(db, index)
  const agent = makeAgent(db, { name: 'stdout', logAdapter: 'stdout' })
  const project = makeProject(db, { name: 'project', targetId: agent, path: root })
  const path = join(root, 'logs', 'run_partial.log')
  const id = occupy(db, makeTask(db, project, 'task'), agent, { id: 'run_partial', stdoutLogPath: path })
  repo.updateRun(db, id, { status: 'failed', endedAt: new Date().toISOString() })
  writeFileSync(path + '.tmp', 'partial write')
  const exit = path.replace('.log', '.exit')
  writeFileSync(exit, '1')
  writeFileSync(exit + '.pid', '12345')
  await cleanup.sweep()
  expect([path + '.tmp', exit, exit + '.pid'].some(existsSync)).toBe(false)
  cleanup.stop(); index.stop(); await index.settled(); db.close()
})
