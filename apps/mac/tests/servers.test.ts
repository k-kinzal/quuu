import { execFile, spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { fromBinary, fromJson, toJson } from '@bufbuild/protobuf'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { QuuuApp } from '../src/main/bootstrap.js'
import { ServerController } from '../src/main/servers/controller.js'
import { QuuuHttpClient } from '../src/client/http.js'
import { operations } from '../src/api/catalog.js'
import { Quuu } from '../src/api/generated/quuu_pb.js'
import { wire } from '../src/api/generated/wire.js'
import { EVENTS } from '../src/api/channels.js'
import { isolateSessionDirs, makeAgent, makeTask, occupy } from './helpers.js'
import * as repo from '../src/main/db/repo.js'

const execute = promisify(execFile)
const cli = resolve(import.meta.dirname, '../bin/quuu')
let dir: string, app: QuuuApp, servers: ServerController, http: QuuuHttpClient
let connection: { http: string; mcp: string; token: string }
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'quuu-servers-'))
  isolateSessionDirs(dir)
  app = new QuuuApp(join(dir, 'taskd.db'))
  app.scheduler.pause()
  servers = new ServerController(app, dir, () => { throw new Error('No desktop in this test') })
  await servers.configure(app.settings.getSettings())
  connection = JSON.parse(readFileSync(servers.connectionFile, 'utf8')) as typeof connection
  http = new QuuuHttpClient(connection.http, connection.token)
})
afterEach(async () => {
  await http?.close().catch(() => undefined)
  await servers?.stop()
  app?.shutdown()
  app?.db.close()
  rmSync(dir, { recursive: true, force: true })
  vi.unstubAllEnvs()
})

describe('the generated gRPC API', () => {
  it('provides an RPC for every desktop operation and protects discovery credentials', () => {
    expect(Object.keys(wire).sort()).toEqual(operations().map(operation => operation.name).sort())
    expect(Quuu.methods.filter(method => !['connect', 'disconnect', 'watch', 'pair'].includes(method.localName)).map(method => method.localName).sort()).toEqual(Object.values(wire).map(mapping => mapping.method).sort())
    expect(statSync(servers.connectionFile).mode & 0o777).toBe(0o600)
    expect(statSync(join(dir, 'server-token')).mode & 0o777).toBe(0o600)
  })
  it('creates and operates tasks with real HTTP/2 and preserves partial updates, null, false and empty arrays', async () => {
    const project = await http.api.projects.create({ name: 'API', path: dir })
    const task = await http.api.tasks.create({ projectId: project.id, title: 'hello', status: 'queued', priority: 0 })
    await http.api.tasks.hold(task.id)
    const updated = await http.api.tasks.update({ id: task.id, patch: { dependsOn: [], scheduledAt: null, prompt: '' } })
    expect(updated).toMatchObject({ title: 'hello', status: 'held', priority: 0, prompt: '', dependsOn: [], scheduledAt: null, archived: false })
    expect((await http.api.tasks.list({ limit: 1 })).tasks.map(task => task.id)).toEqual([task.id])
    await http.api.settings.set({ notifyOnReview: false })
    expect((await http.api.settings.get()).notifyOnReview).toBe(false)
    expect((await http.api.settings.get()).httpEnabled).toBe(true)
    expect((await http.api.groups.list())).toEqual([])
    await expect(http.call('tasks.create', { projectId: project.id, title: 'invalid', status: 'done' })).rejects.toThrow()
    expect(app.tasks.listTasks()).toHaveLength(1)
  })
  it('rejects unauthenticated callers before operations execute', async () => {
    const denied = new QuuuHttpClient(connection.http, 'wrong')
    await expect(denied.api.projects.list()).rejects.toMatchObject({ code: 16 })
    await denied.close().catch(() => undefined)
    expect(app.projects.listProjects()).toHaveLength(0)
  })
  it('accepts pinned v1 bytes from an independent consumer and validates raw protobuf requests on the server', async () => {
    const headers = new Headers({ authorization: `Bearer ${connection.token}` })
    const caller = await http.rpc.connect({}, { headers })
    headers.set('quuu-client-id', caller.clientId)
    try {
      // v1 SettingsSetRequest: value (field 1), notifyOnReview (field 3), explicit false.
      const request = fromBinary(Quuu.method.settingsSet.input, Buffer.from('0a021800', 'hex'))
      const response = await http.rpc.settingsSet(request, { headers })
      expect(toJson(Quuu.method.settingsSet.output, response)).toMatchObject({ value: { notifyOnReview: false, httpEnabled: true } })
      const invalid = fromJson(Quuu.method.tasksCreate.input, { value: { projectId: 'missing', title: 'invalid', status: 'done' } })
      await expect(http.rpc.tasksCreate(invalid, { headers })).rejects.toMatchObject({ code: 3 })
      expect(app.tasks.listTasks()).toEqual([])
    } finally { await http.rpc.disconnect({}, { headers }) }
  })
  it('pages tasks by a stable sequence and filters archived history on the server', async () => {
    const project = app.projects.createProject({ name: 'API', path: dir })
    const first = app.tasks.createTask({ projectId: project.id, title: 'first' })
    const second = app.tasks.createTask({ projectId: project.id, title: 'second', dependsOn: [{ taskId: first.id, mode: 'finished' }] })
    const page = await http.api.tasks.list({ limit: 1 })
    expect(page.tasks[0].id).toBe(first.id)
    expect((await http.api.tasks.list({ limit: 1, after: page.next! })).tasks[0]).toMatchObject({ id: second.id, dependsOn: [{ taskId: first.id, mode: 'finished' }] })
    app.tasks.archiveTask(first.id, true)
    expect((await http.api.tasks.list({ archived: 'only' })).tasks.map(task => task.id)).toEqual([first.id])
  })
  it('the built CLI resolves names and prefixes, and exposes settings and workflow operations', async () => {
    app.projects.createProject({ name: 'API 検証', path: dir })
    const env = { ...process.env, QUUU_CONNECTION_FILE: servers.connectionFile }
    const created = await execute(cli, ['tasks', 'create', '--project', 'API 検証', '--title', 'CLI', '--priority', '0'], { env })
    const { task } = JSON.parse(created.stdout) as { task: { id: string; status: string } }
    expect(task.status).toBe('queued')
    await execute(cli, ['tasks', 'update', task.id.slice(0, 12), '--title', 'updated'], { env })
    expect(app.tasks.getTask(task.id)?.title).toBe('updated')
    const result = await execute(cli, ['settings', 'set', '--json', '{"notifyOnFailure":false}'], { env })
    expect((JSON.parse(result.stdout) as { notifyOnFailure: boolean }).notifyOnFailure).toBe(false)
    const listed = await execute(cli, ['tasks', 'list', '--project', dir], { env })
    expect((JSON.parse(listed.stdout) as { tasks: unknown[] }).tasks).toHaveLength(1)
  })
  it('queries lists with JMESPath before rendering JSON or tables and preserves generic operation shapes', async () => {
    const project = app.projects.createProject({ name: '日本語 project', path: dir })
    makeAgent(app.db, { name: 'CLI agent', enabled: true })
    const env = { ...process.env, QUUU_CONNECTION_FILE: servers.connectionFile, QUUU_OUTPUT: 'json' }
    const selected = await execute(cli, ['projects', 'list', '--query', 'projects[?name==`日本語 project`].{name:name,path:path}'], { env })
    expect(JSON.parse(selected.stdout)).toEqual([{ name: project.name, path: dir }])
    const table = await execute(cli, ['projects', 'list', '--output', 'table', '--query', 'projects[].{name:name,path:path}'], { env })
    expect(table.stdout).toContain('NAME')
    expect(table.stdout).toContain('日本語 project')
    expect(table.stdout).not.toContain(project.id)
    const generic = await execute(cli, ['call', 'projects.list', '--query', '[].name'], { env })
    expect(JSON.parse(generic.stdout)).toEqual([project.name])
    const agents = await execute(cli, ['agents', 'list', '--query', '[?enabled].name'], { env })
    expect(JSON.parse(agents.stdout)).toContain('CLI agent')
    for (const resource of ['groups', 'rules']) {
      const empty = await execute(cli, [resource, 'list', '--query', 'length(@)'], { env })
      expect(JSON.parse(empty.stdout)).toBe(0)
    }
    const noMatch = await execute(cli, ['projects', 'list', '--query', 'projects[?name==`absent`]'], { env })
    expect(JSON.parse(noMatch.stdout)).toEqual([])
    const missing = await execute(cli, ['projects', 'list', '--query', 'missing'], { env })
    expect(JSON.parse(missing.stdout)).toBeNull()
  }, 15_000)

  it('applies sorting and aggregates to all task pages after server filters', async () => {
    const project = app.projects.createProject({ name: 'paging', path: dir })
    for (let index = 0; index < 205; index++) makeTask(app.db, project.id, `task ${String(index).padStart(3, '0')}`)
    makeTask(app.db, project.id, 'excluded', 2, 'draft')
    const env = { ...process.env, QUUU_CONNECTION_FILE: servers.connectionFile, QUUU_OUTPUT: 'json' }
    const result = await execute(cli, ['tasks', 'list', '--project', project.id, '--status', 'queued', '--query', '{count:length(tasks),last:sort_by(tasks, &title)[-1].title}'], { env })
    expect(JSON.parse(result.stdout)).toEqual({ count: 205, last: 'task 204' })
    const page = await execute(cli, ['tasks', 'list', '--json', '{"limit":1}', '--query', '{count:length(tasks),next:next}'], { env })
    expect(JSON.parse(page.stdout)).toHaveProperty('count', 1)
    expect(JSON.parse(page.stdout)).toHaveProperty('next', expect.any(Number))
  }, 15_000)

  it('validates queries before mutations and preserves JSON file and stdin inputs', async () => {
    const env = { ...process.env, QUUU_CONNECTION_FILE: servers.connectionFile, QUUU_OUTPUT: 'json' }
    await expect(execute(cli, ['call', 'projects.create', JSON.stringify({ name: 'must not exist', path: dir }), '--query', '['], { env }))
      .rejects.toHaveProperty('stderr', expect.stringContaining('Invalid --query'))
    expect(app.projects.listProjects()).toHaveLength(0)
    const file = join(dir, 'project.json')
    writeFileSync(file, JSON.stringify({ name: 'file input', path: dir }))
    const created = await execute(cli, ['projects', 'create', '--json', `@${file}`], { env })
    const project = JSON.parse(created.stdout) as { id: string }
    const child = spawn(cli, ['tasks', 'create', '--project', project.id, '--title=-literal', '--status', 'held', '--prompt-file', '-'], { env })
    let stdout = '', stderr = ''
    child.stdout.on('data', (data: Buffer) => { stdout += data.toString() })
    child.stderr.on('data', (data: Buffer) => { stderr += data.toString() })
    const exited = once(child, 'exit')
    child.stdin.end('A multiline instruction\nwith $ and `quotes`.')
    expect((await exited)[0]).toBe(0)
    expect(stderr).toBe('')
    expect(JSON.parse(stdout)).toMatchObject({ task: { title: '-literal', prompt: 'A multiline instruction\nwith $ and `quotes`.', status: 'held' } })
  }, 15_000)

  it('reads durable session history in bounded pages without taking over a live conversation', async () => {
    const project = app.projects.createProject({ name: 'logs', path: dir })
    const agentId = makeAgent(app.db, { name: 'test', logAdapter: 'stdout' })
    const task = app.tasks.createTask({ projectId: project.id, title: 'history' })
    const log = join(dir, 'run.log')
    writeFileSync(log, 'A convention worth keeping\n')
    const runId = occupy(app.db, task.id, agentId, { stdoutLogPath: log })
    repo.updateRun(app.db, runId, { status: 'succeeded' })
    const page = await http.api.logs.page({ runId, limit: 1, search: 'convention' })
    expect(page.exists).toBe(true)
    expect(page.messages).toHaveLength(1)
    expect(JSON.stringify(page.messages)).toContain('convention')
    await expect(http.api.logs.page({ runId, generation: 'obsolete' })).rejects.toThrow('reindexed')
    const result = await execute(cli, ['tasks', 'logs', task.id, '--all', '--search', 'convention'], { env: { ...process.env, QUUU_CONNECTION_FILE: servers.connectionFile } })
    expect(JSON.parse(result.stdout)).toMatchObject({ taskId: task.id, runId })
  }, 15_000) // Include real CLI startup, as in the other CLI integration cases above.
  it('does not present an unavailable session log as an empty successful export', async () => {
    const project = app.projects.createProject({ name: 'logs', path: dir })
    const agentId = makeAgent(app.db, { name: 'test', logAdapter: 'stdout' })
    const task = app.tasks.createTask({ projectId: project.id, title: 'missing log' })
    const runId = occupy(app.db, task.id, agentId, { stdoutLogPath: join(dir, 'missing.log') })
    repo.updateRun(app.db, runId, { status: 'succeeded' })
    await expect(execute(cli, ['tasks', 'logs', task.id], { env: { ...process.env, QUUU_CONNECTION_FILE: servers.connectionFile } }))
      .rejects.toMatchObject({ code: 1, stderr: `quuu: Session log is unavailable for run ${runId}\n` })
  }, 15_000) // Real CLI startup, as above.
  it('keeps terminal ownership and event streams isolated and releases them on disconnect', async () => {
    const other = new QuuuHttpClient(connection.http, connection.token)
    const close = vi.spyOn(app.terminal, 'closeWorkbenchTerminal').mockImplementation(() => undefined)
    vi.spyOn(app.terminal, 'openWorkbenchTerminal').mockReturnValue({ id: 'owned-pty', cwd: dir, shell: '/bin/sh', columns: 80, rows: 24 })
    const abort = new AbortController()
    const stream = http.watch(abort.signal)
    try {
      const ready = await stream.next()
      if (ready.done) throw new Error('Event stream closed before becoming ready')
      expect(ready.value.name).toBe('quuu.ready')
      await http.api.terminal.open({ taskId: 'fixture', columns: 80, rows: 24 })
      await expect(other.api.terminal.input({ sessionId: 'owned-pty', input: 'wrong caller' })).rejects.toThrow('Not a terminal')
      const event = { sessionId: 'owned-pty', type: 'output', data: 'hello' }
      app.terminals.emit('terminal', event)
      expect((await stream.next()).value).toEqual({ name: EVENTS.terminal, payload: event })
      await http.close()
      expect(close).toHaveBeenCalledOnce()
      expect(close).toHaveBeenCalledWith('owned-pty')
      expect(await other.api.projects.list()).toEqual([])
    } finally { abort.abort(); await stream.return(undefined).catch(() => undefined); await other.close() }
  })
  it('publishes settings and task snapshots to other clients without requiring another read', async () => {
    const other = new QuuuHttpClient(connection.http, connection.token)
    const abort = new AbortController()
    const stream = http.watch(abort.signal)
    try {
      await stream.next()
      await other.api.settings.set({ theme: 'light' })
      expect((await stream.next()).value).toMatchObject({ name: EVENTS.settings, payload: { theme: 'light' } })
      const project = app.projects.createProject({ name: 'event', path: dir })
      const task = app.tasks.createTask({ projectId: project.id, title: 'event task' })
      expect((await stream.next()).value).toMatchObject({ name: EVENTS.snapshot, payload: { tasks: [{ id: task.id }] } })
    } finally { abort.abort(); await stream.return(undefined).catch(() => undefined); await other.close() }
  })
  it('a persistent CLI session can load a view and close that same view', async () => {
    const release = vi.spyOn(app, 'releaseSessionView')
    const child = spawn(cli, ['stream'], { env: { ...process.env, QUUU_CONNECTION_FILE: servers.connectionFile }, stdio: ['pipe', 'pipe', 'pipe'] })
    const lines = createInterface({ input: child.stdout })
    const iterator = lines[Symbol.asyncIterator]()
    try {
      child.stdin.write(JSON.stringify({ id: 1, operation: 'session.load', input: 'missing' }) + '\n')
      expect(JSON.parse((await iterator.next()).value as string)).toMatchObject({ id: 1, result: { exists: false } })
      child.stdin.write(JSON.stringify({ id: 2, operation: 'session.close' }) + '\n')
      expect(JSON.parse((await iterator.next()).value as string)).toEqual({ id: 2, result: null })
      expect(release).toHaveBeenCalledOnce()
      child.stdin.end()
      expect((await once(child, 'exit'))[0]).toBe(0)
    } finally { lines.close(); child.kill() }
  })
})

it('keeps MCP credentials usable after an app restart', async () => {
  await servers.stop()
  servers = new ServerController(app, dir, () => { throw new Error('No desktop in this test') })
  await servers.configure(app.settings.getSettings())
  const current = JSON.parse(readFileSync(servers.connectionFile, 'utf8')) as typeof connection
  expect(current.token).toBe(connection.token)
  const client = new Client({ name: 'restart', version: '1' })
  const transport = new StreamableHTTPClientTransport(new URL(current.mcp), { requestInit: { headers: { authorization: `Bearer ${connection.token}` } } })
  try {
    await client.connect(transport)
    expect((await client.listTools()).tools.length).toBe(operations().length)
    await transport.terminateSession()
  } finally { await client.close() }
})

it('MCP lists every operation and applies changes through the same operations as gRPC', async () => {
  const client = new Client({ name: 'test', version: '1' })
  const transport = new StreamableHTTPClientTransport(new URL(connection.mcp), { requestInit: { headers: { authorization: `Bearer ${connection.token}` } } })
  try {
    await client.connect(transport)
    expect((await client.listTools()).tools.map(tool => tool.name).sort()).toEqual(operations().map(operation => operation.name.replaceAll('.', '_')).sort())
    const result = await client.callTool({ name: 'projects_create', arguments: { name: 'MCP', path: dir } })
    expect(result.isError).not.toBe(true)
    expect((await http.api.projects.list())[0].name).toBe('MCP')
    const invalid = await client.callTool({ name: 'tasks_create', arguments: { projectId: 'missing', title: 'test', status: 'running' } })
    expect(invalid.isError).toBe(true)
    await transport.terminateSession()
  } finally { await client.close() }
})

it('turns each server off independently while direct app operations continue to work', async () => {
  await servers.configure({ ...app.settings.getSettings(), httpEnabled: false })
  expect(app.settings.serverStatus.http.url).toBeNull()
  expect(app.settings.serverStatus.mcp.url).not.toBeNull()
  await expect(http.api.projects.list()).rejects.toThrow()
  const project = app.projects.createProject({ name: 'still works', path: dir })
  expect(app.projects.listProjects()[0].id).toBe(project.id)
  await servers.configure({ ...app.settings.getSettings(), httpEnabled: false, mcpEnabled: false })
  expect(app.settings.serverStatus.mcp.url).toBeNull()
})

it('reports an occupied port without stopping the app or the other listener', async () => {
  const occupied = createServer()
  occupied.listen(0, '127.0.0.1')
  await once(occupied, 'listening')
  const address = occupied.address() as { port: number }
  try {
    await servers.configure({ ...app.settings.getSettings(), httpPort: address.port })
    expect(app.settings.serverStatus.http.error).toContain('EADDRINUSE')
    expect(app.settings.serverStatus.mcp.url).toBe(connection.mcp)
    expect(app.scheduler.status().running).toBe(false)
  } finally { await new Promise<void>(resolve => occupied.close(() => resolve())) }
})

it('returns a successful settings response before switching off its own HTTP listener', async () => {
  expect((await http.api.settings.set({ httpEnabled: false })).httpEnabled).toBe(false)
  await vi.waitFor(() => expect(app.settings.serverStatus.http.url).toBeNull())
  expect(app.settings.serverStatus.mcp.url).toBe(connection.mcp)
})

it('MCP rejects browser origins and unauthenticated requests before creating a session', async () => {
  expect((await fetch(connection.mcp, { method: 'POST' })).status).toBe(401)
  expect((await fetch(connection.mcp, { method: 'POST', headers: { authorization: `Bearer ${connection.token}`, origin: 'https://unrelated.example' } })).status).toBe(403)
})
