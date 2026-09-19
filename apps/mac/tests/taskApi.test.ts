import { execFile } from 'node:child_process'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { QuuuApp } from '../src/main/bootstrap.js'
import { TaskApiServer } from '../src/main/taskApi.js'

const run = promisify(execFile)
const cli = resolve(import.meta.dirname, '../bin/quuu')

interface Envelope {
  ok: boolean
  data?: Record<string, unknown>
  error?: { code: string; message: string }
}

function call(
  socketPath: string,
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; body: Envelope }> {
  const payload = body === undefined ? null : JSON.stringify(body)
  return new Promise((resolveCall, reject) => {
    const req = request(
      {
        socketPath,
        method,
        path,
        headers:
          payload === null
            ? undefined
            : { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) }
      },
      (response) => {
        response.setEncoding('utf8')
        const chunks: string[] = []
        response.on('data', (chunk: string) => chunks.push(chunk))
        response.on('end', () => {
          resolveCall({
            status: response.statusCode ?? 0,
            body: JSON.parse(chunks.join('')) as Envelope
          })
        })
      }
    )
    req.on('error', reject)
    if (payload !== null) req.write(payload)
    req.end()
  })
}

describe('the local task API and the CLI', () => {
  let dir: string
  let socketPath: string
  let app: QuuuApp
  let server: TaskApiServer
  let projectId: string

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'quuu-api-'))
    socketPath = join(dir, 'quuu.sock')
    app = new QuuuApp(join(dir, 'taskd.db'))
    projectId = app.projects.createProject({ name: 'API 検証', path: dir }).id
    server = new TaskApiServer(app, socketPath)
    await server.start()
  })

  afterEach(async () => {
    await server.stop()
    app.shutdown()
    app.db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('offers creating, reading and operating on tasks over a Unix socket only the owner can use', async () => {
    expect(statSync(socketPath).mode & 0o777).toBe(0o600)

    const created = await call(socketPath, 'POST', '/v1/tasks', {
      projectId,
      title: 'API から積む',
      prompt: '正規の操作を通す',
      status: 'queued',
      priority: 1
    })
    expect(created.status).toBe(201)
    const task = created.body.data?.['task'] as { id: string; queuePosition: number }
    expect(task.queuePosition).toBe(1)

    const held = await call(socketPath, 'POST', `/v1/tasks/${task.id}/hold`)
    expect((held.body.data?.['task'] as { status: string }).status).toBe('held')

    const archived = await call(socketPath, 'POST', `/v1/tasks/${task.id}/archive`)
    expect((archived.body.data?.['task'] as { archived: boolean }).archived).toBe(true)
    const shown = await call(socketPath, 'GET', `/v1/tasks/${task.id}`)
    expect((shown.body.data?.['task'] as { title: string }).title).toBe('API から積む')
  })

  it('does not let the outside create a running or done task directly', async () => {
    const response = await call(socketPath, 'POST', '/v1/tasks', {
      projectId,
      title: '不正な状態',
      status: 'done'
    })
    expect(response.status).toBe(400)
    expect(response.body.error?.code).toBe('invalid_field')
    expect(app.tasks.listTasks(true)).toHaveLength(0)
  })

  it('resolves a project name from the quuu command to queue a task, and updates by id prefix', async () => {
    const env = { ...process.env, QUUU_SOCKET: socketPath }
    const created = await run(
      cli,
      [
        'tasks',
        'create',
        '--project',
        'API 検証',
        '--title',
        'CLI から積む',
        '--prompt',
        'AI が実行する',
        '--priority',
        '0'
      ],
      { env }
    )
    const task = JSON.parse(created.stdout) as { task: { id: string; status: string } }
    expect(task.task.status).toBe('queued')

    const prefix = task.task.id.slice(0, 12)
    const updated = await run(cli, ['tasks', 'update', prefix, '--title', '更新済み'], { env })
    expect((JSON.parse(updated.stdout) as { task: { title: string } }).task.title).toBe('更新済み')

    const listed = await run(cli, ['tasks', 'list', '--project', dir], { env })
    const tasks = (JSON.parse(listed.stdout) as { tasks: Array<{ id: string }> }).tasks
    expect(tasks.map((entry) => entry.id)).toEqual([task.task.id])
  })
})
