import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { QuuuHttpClient, connectionSettings } from '../client/http.ts'
import { operations } from '../api/catalog.ts'
import { z } from 'zod'

let client
function connect() {
  if (!client) {
    const settings = connectionSettings()
    if (!settings.http) throw new CliError('HTTP server is off. Enable it in Quuu Settings → Connections.')
    client = new QuuuHttpClient(settings.http, settings.token)
  }
  return client.api
}

class CliError extends Error {
  constructor(message, exitCode = 1) {
    super(message)
    this.exitCode = exitCode
  }
}

function option(options, name) {
  const value = options.get(name)
  return typeof value === 'string' ? value : undefined
}

function requiredOption(options, name) {
  const value = option(options, name)
  if (!value) throw new CliError(`--${name} is required`)
  return value
}

function textOption(options, directName, fileName) {
  const direct = option(options, directName)
  const path = option(options, fileName)
  if (direct !== undefined && path !== undefined) {
    throw new CliError(`--${directName} and --${fileName} cannot be combined`)
  }
  if (path === undefined) return direct
  return readFileSync(path === '-' ? 0 : path, 'utf8')
}

function priorityOption(options) {
  const value = option(options, 'priority')
  if (value === undefined) return undefined
  const priority = Number(value)
  if (!Number.isInteger(priority) || priority < 0 || priority > 3) {
    throw new CliError('--priority must be an integer from 0 to 3')
  }
  return priority
}

async function projects() { return connect().projects.list() }

async function allTasks(query = {}) {
  const tasks = []
  let after
  do {
    const page = await connect().tasks.list({ ...query, after })
    tasks.push(...page.tasks)
    after = page.next ?? undefined
  } while (after !== undefined)
  return tasks
}

async function resolveProject(reference) {
  const matches = (await projects()).filter(
    (project) =>
      project.id === reference || project.name === reference || project.path === reference
  )
  if (matches.length === 0) throw new CliError(`project not found: ${reference}`)
  if (matches.length > 1) {
    throw new CliError(`ambiguous project name; specify an ID: ${reference}`)
  }
  return matches[0].id
}

async function resolveTask(reference) {
  if (/^tsk_[a-f0-9]{20}$/.test(reference)) return (await connect().tasks.get(reference)).id
  const matches = new Set()
  let after
  do {
    const page = await connect().tasks.list({ archived: 'include', after })
    for (const task of page.tasks) {
      if (task.id === reference) return task.id
      if (task.id.startsWith(reference) && matches.size < 2) matches.add(task.id)
    }
    after = page.next ?? undefined
  } while (after !== undefined)
  if (matches.size === 0) throw new CliError(`task not found: ${reference}`)
  if (matches.size > 1) throw new CliError(`multiple tasks match the ID prefix: ${reference}`)
  return [...matches][0]
}

async function listTasks(options) {
  const reference = option(options, 'project')
  return { tasks: await allTasks({
    projectId: reference ? await resolveProject(reference) : undefined,
    status: option(options, 'status'),
    archived: options.get('include-archived') === true ? 'include' : 'exclude',
  }) }
}

async function createTask(options) {
  const prompt = textOption(options, 'prompt', 'prompt-file')
  const body = {
    projectId: await resolveProject(requiredOption(options, 'project')),
    title: requiredOption(options, 'title'),
    status: option(options, 'status') ?? 'queued'
  }
  if (prompt !== undefined) body.prompt = prompt
  const priority = priorityOption(options)
  if (priority !== undefined) body.priority = priority
  const scheduledAt = option(options, 'scheduled-at')
  if (scheduledAt !== undefined) body.scheduledAt = scheduledAt
  const agent = option(options, 'agent')
  if (agent !== undefined) body.agentOverrideId = agent
  return { task: await connect().tasks.create(body) }
}

async function updateTask(reference, options) {
  if (options.get('clear-schedule') === true && option(options, 'scheduled-at') !== undefined) {
    throw new CliError('--scheduled-at and --clear-schedule cannot be combined')
  }
  if (options.get('clear-agent') === true && option(options, 'agent') !== undefined) {
    throw new CliError('--agent and --clear-agent cannot be combined')
  }

  const body = {}
  const project = option(options, 'project')
  if (project !== undefined) body.projectId = await resolveProject(project)
  const title = option(options, 'title')
  if (title !== undefined) body.title = title
  const prompt = textOption(options, 'prompt', 'prompt-file')
  if (prompt !== undefined) body.prompt = prompt
  const priority = priorityOption(options)
  if (priority !== undefined) body.priority = priority
  const scheduledAt = option(options, 'scheduled-at')
  if (scheduledAt !== undefined) body.scheduledAt = scheduledAt
  if (options.get('clear-schedule') === true) body.scheduledAt = null
  const reviewNote = option(options, 'review-note')
  if (reviewNote !== undefined) body.reviewNote = reviewNote
  const agent = option(options, 'agent')
  if (agent !== undefined) body.agentOverrideId = agent
  if (options.get('clear-agent') === true) body.agentOverrideId = null

  const taskId = await resolveTask(reference)
  return { task: await connect().tasks.update({ id: taskId, patch: body }) }
}

const ACTIONS = { enqueue: 'enqueue', unqueue: 'unqueue', hold: 'hold', run: 'runNow', done: 'markDone', reopen: 'reopen', cancel: 'cancel', delete: 'remove' }
async function taskAction(action, reference) {
  const id = await resolveTask(reference)
  if (action === 'archive' || action === 'unarchive') return { task: await connect().tasks.archive({ id, archived: action === 'archive' }) }
  const method = ACTIONS[action]
  if (!method) throw new CliError(`unknown task action: ${action}`)
  const result = await connect().tasks[method](id)
  if (action === 'run') {
    if (!result.ok) process.exitCode = 2
    return { task: await connect().tasks.get(id), run: result }
  }
  return action === 'delete' ? { deleted: { id } } : { task: result }
}
async function sendTask(action, reference, options) {
  const message = textOption(options, 'message', 'message-file')
  if (message === undefined || !message.trim()) throw new CliError('--message or --message-file is required')
  const id = await resolveTask(reference)
  if (action === 'send-back') return { task: await connect().tasks.sendBack({ id, note: message }) }
  const result = await connect().tasks.send({ id, message })
  if (!result.ok) process.exitCode = 2
  return { task: await connect().tasks.get(id), result }
}
function jsonInput(text) {
  if (text === undefined) return undefined
  return JSON.parse(text === '-' ? readFileSync(0, 'utf8') : text.startsWith('@') ? readFileSync(text.slice(1), 'utf8') : text)
}
async function logs(reference, options) {
  const id = await resolveTask(reference)
  const runs = await connect().runs.byTask(id)
  const selected = option(options, 'run')
  if (selected && !runs.some(run => run.id === selected)) throw new CliError('The run does not belong to this task')
  const candidates = selected ? runs.filter(run => run.id === selected) : options.get('all') ? runs : runs.slice(0, 1)
  const seen = new Set()
  for (const run of candidates) {
    const key = run.sessionLogPath ? `${run.sessionLogPath}:${run.sessionId}` : run.id
    if (seen.has(key)) continue
    seen.add(key)
    let offset = 0, generation
    do {
      const page = await connect().logs.page({ runId: run.id, offset, generation, search: option(options, 'search') })
      if (!page.exists) {
        console.error(`quuu: Session log is unavailable for run ${run.id}`)
        process.exitCode = 1
      }
      for (const message of page.messages) {
        const line = JSON.stringify({ taskId: id, runId: run.id, sessionId: page.sessionId, message }) + '\n'
        if (!process.stdout.write(line)) await new Promise(resolve => process.stdout.once('drain', resolve))
      }
      offset = page.next
      generation = page.generation
    } while (offset !== null)
  }
}

async function streamCommands(watchOnly) {
  connect()
  const abort = new AbortController()
  const lines = watchOnly ? null : createInterface({ input: process.stdin, crlfDelay: Infinity })
  const inputLines = lines?.[Symbol.asyncIterator]()
  const stop = () => { abort.abort(); lines?.close() }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  let ready
  const started = new Promise(resolve => { ready = resolve })
  let watchError
  const watching = (async () => {
    for await (const event of client.watch(abort.signal)) {
      if (event.name === 'quuu.ready') ready()
      else if (!process.stdout.write(JSON.stringify({ event }) + '\n')) await new Promise(resolve => process.stdout.once('drain', resolve))
    }
  })().catch(error => {
    if (!abort.signal.aborted) watchError = error
    lines?.close()
    ready()
  })
  try {
    await Promise.race([started, watching])
    if (watchError) throw watchError
    if (watchOnly) await watching
    else for await (const line of inputLines) {
      if (!line.trim()) continue
      let request
      try {
        request = JSON.parse(line)
        const result = await client.call(request.operation, request.input, abort.signal)
        process.stdout.write(JSON.stringify({ id: request.id ?? null, result: result ?? null }) + '\n')
      } catch (error) {
        process.stdout.write(JSON.stringify({ id: request?.id ?? null, error: error.message }) + '\n')
      }
    }
    if (watchError) throw watchError
  } finally {
    stop()
    await watching.catch(error => { if (!abort.signal.aborted) throw error })
    process.off('SIGINT', stop)
    process.off('SIGTERM', stop)
  }
}

export async function closeClient() {
  if (client) await client.close().catch(() => { /* The command already reports a lost connection. */ })
}

export function configuration() { return connectionSettings() }

export function describeOperation(name) {
  const operation = operations().find(operation => operation.name === name)
  if (!operation) throw new CliError(`Unknown operation: ${name}`)
  return { name: operation.name, input: z.toJSONSchema(operation.input, { unrepresentable: 'any', io: 'input' }), output: z.toJSONSchema(operation.output, { unrepresentable: 'any' }) }
}

export async function callOperation(name, input) {
  const parsed = jsonInput(input)
  connect()
  return client.call(name, parsed)
}

export async function shortcut(resource, action, reference, values) {
  const options = new Map(Object.entries(values).map(([key, value]) => [key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`), value]))
  if (resource === 'projects') return { projects: await projects() }
  if (action === 'list') return listTasks(options)
  if (action === 'create') return createTask(options)
  if (!reference) throw new CliError('A task ID or unique prefix is required')
  if (action === 'get') {
    const id = await resolveTask(reference)
    const task = await connect().tasks.get(id)
    return { task, project: (await projects()).find(project => project.id === task.projectId) ?? null, runs: await connect().runs.byTask(id) }
  }
  if (action === 'update') return updateTask(reference, options)
  if (action === 'send' || action === 'send-back') return sendTask(action, reference, options)
  if (action === 'logs') return logs(reference, options)
  return taskAction(action, reference)
}

export { streamCommands }
