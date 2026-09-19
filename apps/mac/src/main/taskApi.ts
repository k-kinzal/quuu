import { chmodSync, lstatSync, mkdirSync, unlinkSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { dirname } from 'node:path'
import type { Priority, TaskStatus } from './tasks/status.js'
import { isPriority, isTaskStatus } from './tasks/status.js'
import type { TaskDependency, TaskInput, TaskPatch } from './tasks/types.js'

import { taskApiSocketPath } from './appPaths.js'
import type { QuuuApp } from './bootstrap.js'

const MAX_BODY_BYTES = 1024 * 1024
const CREATE_STATUSES: TaskStatus[] = ['draft', 'held', 'queued']

interface ApiRequest {
  method: string
  url: string
  body?: unknown
}

export interface ApiResponse {
  status: number
  body: unknown
}

class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message)
  }
}

type JsonObject = Record<string, unknown>

function ok(data: unknown, status = 200): ApiResponse {
  return { status, body: { ok: true, data } }
}

function errorResponse(error: unknown): ApiResponse {
  if (error instanceof ApiError) {
    return {
      status: error.status,
      body: { ok: false, error: { code: error.code, message: error.message } }
    }
  }
  const message = error instanceof Error ? error.message : String(error)
  return {
    status: 400,
    body: { ok: false, error: { code: 'invalid_operation', message } }
  }
}

function bodyObject(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError(400, 'invalid_body', 'Body must be a JSON object')
  }
  return value as JsonObject
}

function onlyKeys(input: JsonObject, allowed: readonly string[]): void {
  const unknown = Object.keys(input).filter((key) => !allowed.includes(key))
  if (unknown.length > 0) {
    throw new ApiError(400, 'unknown_field', `Unsupported fields: ${unknown.join(', ')}`)
  }
}

function requiredString(input: JsonObject, key: string): string {
  const value = input[key]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiError(400, 'invalid_field', `${key} is required`)
  }
  return value.trim()
}

function optionalString(input: JsonObject, key: string): string | undefined {
  const value = input[key]
  if (value === undefined) return undefined
  if (typeof value !== 'string') {
    throw new ApiError(400, 'invalid_field', `${key} must be a string`)
  }
  return value
}

function optionalNullableString(input: JsonObject, key: string): string | null | undefined {
  const value = input[key]
  if (value === undefined || value === null) return value
  if (typeof value !== 'string') {
    throw new ApiError(400, 'invalid_field', `${key} must be a string or null`)
  }
  return value
}

function optionalPriority(input: JsonObject): Priority | undefined {
  const value = input['priority']
  if (value === undefined) return undefined
  if (!isPriority(value)) {
    throw new ApiError(400, 'invalid_field', 'priority must be between 0 and 3')
  }
  return value
}

function optionalScheduledAt(input: JsonObject): string | null | undefined {
  const value = optionalNullableString(input, 'scheduledAt')
  if (typeof value === 'string' && Number.isNaN(Date.parse(value))) {
    throw new ApiError(400, 'invalid_field', 'scheduledAt must be in ISO 8601 format')
  }
  return value
}

function optionalDependencies(
  app: QuuuApp,
  input: JsonObject,
  taskId?: string
): TaskDependency[] | undefined {
  const value = input['dependsOn']
  if (value === undefined) return undefined
  if (!Array.isArray(value)) {
    throw new ApiError(400, 'invalid_field', 'dependsOn must be an array')
  }

  const tasks = new Set(app.tasks.listTasks(true).map((task) => task.id))
  const seen = new Set<string>()
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new ApiError(400, 'invalid_field', 'Each dependsOn entry must be an object')
    }
    const dependency = entry as JsonObject
    onlyKeys(dependency, ['taskId', 'mode'])
    const dependencyId = requiredString(dependency, 'taskId')
    const mode = dependency['mode']
    if (mode !== 'done' && mode !== 'finished') {
      throw new ApiError(400, 'invalid_field', 'dependsOn.mode must be done or finished')
    }
    if (!tasks.has(dependencyId)) {
      throw new ApiError(404, 'task_not_found', `Predecessor task not found: ${dependencyId}`)
    }
    if (dependencyId === taskId || seen.has(dependencyId)) {
      throw new ApiError(400, 'invalid_field', `Duplicate predecessor task: ${dependencyId}`)
    }
    seen.add(dependencyId)
    return { taskId: dependencyId, mode }
  })
}

function requireProject(app: QuuuApp, id: string): void {
  if (!app.projects.listProjects().some((project) => project.id === id)) {
    throw new ApiError(404, 'project_not_found', `Project not found: ${id}`)
  }
}

function requireAgent(app: QuuuApp, id: string | null | undefined): void {
  if (id && !app.snapshot().agents.some((agent) => agent.id === id)) {
    throw new ApiError(404, 'agent_not_found', `Agent not found: ${id}`)
  }
}

function requireTask(app: QuuuApp, id: string) {
  const task = app.tasks.getTask(id)
  if (!task) throw new ApiError(404, 'task_not_found', `Task not found: ${id}`)
  return task
}

function taskView(app: QuuuApp, id: string) {
  const task = requireTask(app, id)
  return { ...task, queuePosition: app.queuePositions().get(task.id) ?? null }
}

function createInput(app: QuuuApp, value: unknown): TaskInput {
  const input = bodyObject(value)
  onlyKeys(input, [
    'projectId',
    'title',
    'prompt',
    'priority',
    'status',
    'scheduledAt',
    'agentOverrideId',
    'dependsOn'
  ])
  const projectId = requiredString(input, 'projectId')
  requireProject(app, projectId)
  const status = input['status']
  if (status !== undefined && (!isTaskStatus(status) || !CREATE_STATUSES.includes(status))) {
    throw new ApiError(400, 'invalid_field', 'status on creation must be draft, held, or queued')
  }
  const agentOverrideId = optionalNullableString(input, 'agentOverrideId')
  requireAgent(app, agentOverrideId)
  return {
    projectId,
    title: requiredString(input, 'title'),
    prompt: optionalString(input, 'prompt'),
    priority: optionalPriority(input),
    status,
    scheduledAt: optionalScheduledAt(input),
    agentOverrideId,
    dependsOn: optionalDependencies(app, input)
  }
}

function patchInput(app: QuuuApp, taskId: string, value: unknown): TaskPatch {
  const input = bodyObject(value)
  onlyKeys(input, [
    'projectId',
    'title',
    'prompt',
    'pendingMessage',
    'priority',
    'scheduledAt',
    'reviewNote',
    'agentOverrideId',
    'dependsOn'
  ])
  if (Object.keys(input).length === 0) {
    throw new ApiError(400, 'invalid_body', 'Specify at least one field to change')
  }

  const projectId = optionalString(input, 'projectId')
  if (projectId !== undefined) requireProject(app, projectId)
  const title = optionalString(input, 'title')
  if (title !== undefined && title.trim().length === 0) {
    throw new ApiError(400, 'invalid_field', 'title cannot be empty')
  }
  const agentOverrideId = optionalNullableString(input, 'agentOverrideId')
  requireAgent(app, agentOverrideId)
  const prompt = optionalString(input, 'prompt')
  const pendingMessage = optionalString(input, 'pendingMessage')
  const priority = optionalPriority(input)
  const scheduledAt = optionalScheduledAt(input)
  const reviewNote = optionalString(input, 'reviewNote')
  const dependsOn = optionalDependencies(app, input, taskId)
  const patch: TaskPatch = {}
  if (projectId !== undefined) patch.projectId = projectId
  if (title !== undefined) patch.title = title.trim()
  if (prompt !== undefined) patch.prompt = prompt
  if (pendingMessage !== undefined) patch.pendingMessage = pendingMessage
  if (priority !== undefined) patch.priority = priority
  if (scheduledAt !== undefined) patch.scheduledAt = scheduledAt
  if (reviewNote !== undefined) patch.reviewNote = reviewNote
  if (agentOverrideId !== undefined) patch.agentOverrideId = agentOverrideId
  if (dependsOn !== undefined) patch.dependsOn = dependsOn
  return patch
}

function actionBody(value: unknown, allowed: readonly string[]): JsonObject {
  if (value === undefined) return {}
  const input = bodyObject(value)
  onlyKeys(input, allowed)
  return input
}

async function route(app: QuuuApp, request: ApiRequest): Promise<ApiResponse> {
  const method = request.method.toUpperCase()
  const url = new URL(request.url, 'http://quuu.local')
  const segments = url.pathname
    .split('/')
    .filter(Boolean)
    .map((part) => decodeURIComponent(part))

  if (method === 'GET' && url.pathname === '/v1/health') {
    return ok({ status: 'ok' })
  }
  if (method === 'GET' && url.pathname === '/v1/projects') {
    return ok({ projects: app.projects.listProjects() })
  }
  if (segments[0] !== 'v1' || segments[1] !== 'tasks') {
    throw new ApiError(404, 'not_found', `Endpoint not found: ${url.pathname}`)
  }

  if (segments.length === 2 && method === 'GET') {
    const status = url.searchParams.get('status')
    if (status !== null && !isTaskStatus(status)) {
      throw new ApiError(400, 'invalid_query', `Unrecognized status: ${status}`)
    }
    const projectId = url.searchParams.get('projectId')
    if (projectId) requireProject(app, projectId)
    const archived = url.searchParams.get('archived') ?? 'exclude'
    if (!['exclude', 'include', 'only'].includes(archived)) {
      throw new ApiError(400, 'invalid_query', 'archived must be exclude, include, or only')
    }

    const positions = app.queuePositions()
    const tasks = app.tasks
      .listTasks(archived !== 'exclude')
      .filter((task) => !projectId || task.projectId === projectId)
      .filter((task) => !status || task.status === status)
      .filter((task) => archived === 'include' || task.archived === (archived === 'only'))
      .map((task) => ({ ...task, queuePosition: positions.get(task.id) ?? null }))
    return ok({ tasks })
  }

  if (segments.length === 2 && method === 'POST') {
    const task = app.tasks.createTask(createInput(app, request.body))
    return ok({ task: taskView(app, task.id) }, 201)
  }

  const taskId = segments[2]
  if (!taskId) throw new ApiError(404, 'not_found', 'Task ID is required')
  requireTask(app, taskId)

  if (segments.length === 3 && method === 'GET') {
    const task = taskView(app, taskId)
    const project = app.projects.listProjects().find((candidate) => candidate.id === task.projectId) ?? null
    return ok({ task, project, runs: app.tasks.runsByTask(taskId) })
  }
  if (segments.length === 3 && method === 'PATCH') {
    app.tasks.updateTask(taskId, patchInput(app, taskId, request.body))
    return ok({ task: taskView(app, taskId) })
  }
  if (segments.length === 3 && method === 'DELETE') {
    const task = requireTask(app, taskId)
    app.tasks.deleteTask(taskId)
    return ok({ deleted: { id: task.id, title: task.title } })
  }

  if (segments.length !== 4 || method !== 'POST') {
    throw new ApiError(404, 'not_found', `Endpoint not found: ${url.pathname}`)
  }

  const action = segments[3]
  switch (action) {
    case 'enqueue':
      actionBody(request.body, [])
      app.tasks.enqueueTask(taskId)
      break
    case 'unqueue':
      actionBody(request.body, [])
      app.tasks.unqueueTask(taskId)
      break
    case 'hold':
      actionBody(request.body, [])
      app.tasks.holdTask(taskId)
      break
    case 'run-now': {
      actionBody(request.body, [])
      const run = await app.tasks.runNow(taskId)
      return ok({ task: taskView(app, taskId), run })
    }
    case 'mark-done':
      actionBody(request.body, [])
      app.tasks.markDone(taskId)
      break
    case 'reopen':
      actionBody(request.body, [])
      app.tasks.reopen(taskId)
      break
    case 'cancel':
      actionBody(request.body, [])
      app.tasks.cancelTask(taskId)
      break
    case 'archive':
      actionBody(request.body, [])
      app.tasks.archiveTask(taskId, true)
      break
    case 'unarchive':
      actionBody(request.body, [])
      app.tasks.archiveTask(taskId, false)
      break
    case 'send': {
      const input = actionBody(request.body, ['message'])
      const result = app.tasks.send(taskId, requiredString(input, 'message'))
      return ok({ task: taskView(app, taskId), result })
    }
    case 'send-back': {
      const input = actionBody(request.body, ['message'])
      app.tasks.sendBack(taskId, requiredString(input, 'message'))
      break
    }
    default:
      throw new ApiError(404, 'action_not_found', `Task action not found: ${action}`)
  }
  return ok({ task: taskView(app, taskId) })
}

/** The task API's pure routing, shared by tests and the HTTP server. */
export async function dispatchTaskApi(app: QuuuApp, request: ApiRequest): Promise<ApiResponse> {
  try {
    return await route(app, request)
  } catch (error) {
    return errorResponse(error)
  }
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  request.setEncoding('utf8')
  const chunks: string[] = []
  let size = 0
  for await (const chunk of request) {
    const text = String(chunk)
    size += Buffer.byteLength(text)
    if (size > MAX_BODY_BYTES) {
      throw new ApiError(413, 'body_too_large', 'Requests are limited to 1 MiB')
    }
    chunks.push(text)
  }
  if (size === 0) return undefined
  try {
    return JSON.parse(chunks.join('')) as unknown
  } catch {
    throw new ApiError(400, 'invalid_json', 'Cannot parse JSON')
  }
}

function writeJson(response: ServerResponse, result: ApiResponse): void {
  response.writeHead(result.status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  })
  response.end(`${JSON.stringify(result.body)}\n`)
}

/**
 * The local task API, which exists only while Quuu is running.
 *
 * Uses HTTP syntax but doesn't listen on TCP; it binds to a Unix socket
 * readable only by the owner. Local tools other than the CLI can reuse the same contract.
 */
export class TaskApiServer {
  private readonly server: Server
  private listening = false

  constructor(
    private readonly app: QuuuApp,
    readonly socketPath = taskApiSocketPath()
  ) {
    this.server = createServer((request, response) => void this.handle(request, response))
  }

  async start(): Promise<void> {
    mkdirSync(dirname(this.socketPath), { recursive: true })
    this.removeSocket(true)
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => reject(error)
      this.server.once('error', onError)
      this.server.listen(this.socketPath, () => {
        this.server.off('error', onError)
        this.listening = true
        chmodSync(this.socketPath, 0o600)
        resolve()
      })
    })
    this.server.on('error', (error) => console.error('Quuu task API:', error))
  }

  async stop(): Promise<void> {
    if (this.listening) {
      await new Promise<void>((resolve) => {
        this.server.close(() => resolve())
        this.server.closeAllConnections()
      })
      this.listening = false
    }
    this.removeSocket(false)
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const body = request.method === 'GET' ? undefined : await readBody(request)
      const result = await dispatchTaskApi(this.app, {
        method: request.method ?? 'GET',
        url: request.url ?? '/',
        body
      })
      writeJson(response, result)
    } catch (error) {
      writeJson(response, errorResponse(error))
    }
  }

  private removeSocket(beforeStart: boolean): void {
    try {
      const stat = lstatSync(this.socketPath)
      if (!stat.isSocket()) {
        if (beforeStart) {
          throw new Error(`Task API path is not a socket: ${this.socketPath}`)
        }
        return
      }
      unlinkSync(this.socketPath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
}
