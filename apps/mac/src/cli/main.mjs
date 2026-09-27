#!/usr/bin/env node

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

const HELP = `Operate Quuu through its built-in gRPC server. Output is JSON.

Usage:
  quuu api                         List every operation
  quuu describe RESOURCE.ACTION    Show its input/output schemas
  quuu call RESOURCE.ACTION [JSON|@FILE|-]
  quuu RESOURCE ACTION --json JSON|@FILE|-
  quuu tasks logs TASK_ID [--all] [--search TEXT] [--run RUN_ID]
  quuu stream                      JSONL commands and events in one client session
  quuu watch                       Stream app events until interrupted
  quuu config                      Show MCP endpoint and credentials
  quuu projects list
  quuu tasks list [--project ID|NAME|PATH] [--status STATUS] [--include-archived]
  quuu tasks get TASK_ID
  quuu tasks create --project ID|NAME|PATH --title TITLE [options]
  quuu tasks update TASK_ID [options]
  quuu tasks <action> TASK_ID
  quuu tasks send TASK_ID (--message TEXT | --message-file PATH|-)
  quuu tasks send-back TASK_ID (--message TEXT | --message-file PATH|-)

Create options:
  --prompt TEXT | --prompt-file PATH|-   Instruction body
  --priority 0|1|2|3                    Default: 2 (P0 keeps its run slot until done)
  --status draft|held|queued             Default: queued
  --scheduled-at ISO8601
  --agent AGENT_ID

Update options:
  --title TEXT
  --prompt TEXT | --prompt-file PATH|-
  --priority 0|1|2|3
  --project ID|NAME|PATH
  --scheduled-at ISO8601 | --clear-schedule
  --review-note TEXT
  --agent AGENT_ID | --clear-agent

Actions:
  enqueue, unqueue, hold, run, done, reopen, cancel,
  archive, unarchive, delete

Environment:
  QUUU_CONNECTION_FILE  Override the connection discovery file
  QUUU_URL / QUUU_TOKEN  Explicit gRPC endpoint and credential
  QUUU_USER_DATA   Override the Quuu data directory
`

const BOOLEAN_OPTIONS = new Set(['include-archived', 'clear-schedule', 'clear-agent', 'all'])

class CliError extends Error {
  constructor(message, exitCode = 1) {
    super(message)
    this.exitCode = exitCode
  }
}

function parseArgs(args) {
  const positionals = []
  const options = new Map()
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (!argument.startsWith('--')) {
      positionals.push(argument)
      continue
    }
    const equal = argument.indexOf('=')
    const name = argument.slice(2, equal < 0 ? undefined : equal)
    if (name.length === 0) throw new CliError(`cannot parse option: ${argument}`)
    if (options.has(name)) throw new CliError(`duplicate option: --${name}`)
    if (equal >= 0) {
      options.set(name, argument.slice(equal + 1))
      continue
    }
    if (BOOLEAN_OPTIONS.has(name)) {
      options.set(name, true)
      continue
    }
    const value = args[index + 1]
    if (value === undefined || value.startsWith('--')) {
      throw new CliError(`--${name} requires a value`)
    }
    options.set(name, value)
    index += 1
  }
  return { positionals, options }
}

function assertOptions(options, allowed) {
  const unknown = [...options.keys()].filter((name) => !allowed.includes(name))
  if (unknown.length > 0) throw new CliError(`unsupported option: --${unknown.join(', --')}`)
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
  assertOptions(options, ['project', 'status', 'include-archived'])
  const reference = option(options, 'project')
  return { tasks: await allTasks({
    projectId: reference ? await resolveProject(reference) : undefined,
    status: option(options, 'status'),
    archived: options.get('include-archived') === true ? 'include' : 'exclude',
  }) }
}

async function createTask(options) {
  assertOptions(options, [
    'project',
    'title',
    'prompt',
    'prompt-file',
    'priority',
    'status',
    'scheduled-at',
    'agent'
  ])
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
  assertOptions(options, [
    'project',
    'title',
    'prompt',
    'prompt-file',
    'priority',
    'scheduled-at',
    'clear-schedule',
    'review-note',
    'agent',
    'clear-agent'
  ])
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
async function taskAction(action, reference, options) {
  assertOptions(options, [])
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
  assertOptions(options, ['message', 'message-file'])
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
function output(value) { console.log(JSON.stringify(value ?? null, null, 2)) }
async function logs(reference, options) {
  assertOptions(options, ['all', 'search', 'run'])
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

async function main() {
  const [resource, verb, ...rest] = process.argv.slice(2)
  if (!resource || resource === 'help' || resource === '--help') {
    process.stdout.write(HELP)
    return
  }

  if (resource === 'stream' || resource === 'watch') { await streamCommands(resource === 'watch'); return }
  if (resource === 'api') { output(operations().map(operation => operation.name)); return }
  if (resource === 'config') { output(connectionSettings()); return }
  if (resource === 'describe') {
    const operation = operations().find(operation => operation.name === verb)
    if (!operation) throw new CliError('Unknown operation')
    output({ name: operation.name, input: z.toJSONSchema(operation.input, { unrepresentable: 'any', io: 'input' }), output: z.toJSONSchema(operation.output, { unrepresentable: 'any' }) })
    return
  }
  if (resource === 'call') {
    if (rest.length > 1) throw new CliError('usage: quuu call RESOURCE.ACTION [JSON|@FILE|-]')
    connect()
    output(await client.call(verb, jsonInput(rest[0])))
    return
  }
  const operationName = `${resource}.${verb?.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())}`
  if (rest.some(argument => argument === '--json' || argument.startsWith('--json=')) || (operations().some(operation => operation.name === operationName) && !['tasks', 'task', 'projects', 'project'].includes(resource))) {
    const parsed = parseArgs(rest)
    assertOptions(parsed.options, ['json'])
    if (parsed.positionals.length > 1) throw new CliError('Expected one JSON argument')
    connect()
    output(await client.call(operationName, jsonInput(option(parsed.options, 'json') ?? parsed.positionals[0])))
    return
  }
  if ((resource === 'projects'  || resource === 'project') && verb === 'list') {
    const parsed = parseArgs(rest)
    if (parsed.positionals.length > 0) throw new CliError('projects list takes no arguments')
    assertOptions(parsed.options, [])
    console.log(JSON.stringify({ projects: await projects() }, null, 2))
    return
  }

  if (resource !== 'tasks' && resource !== 'task') throw new CliError(`unknown resource: ${resource}`)
  if (!verb) throw new CliError('specify a task action')
  const parsed = parseArgs(rest)
  let result
  if (verb === 'logs') {
    if (parsed.positionals.length !== 1) throw new CliError('usage: quuu tasks logs TASK_ID [--all] [--search TEXT]')
    await logs(parsed.positionals[0], parsed.options)
    return
  }
  if (verb === 'list') {
    if (parsed.positionals.length > 0) throw new CliError('tasks list takes no arguments')
    result = await listTasks(parsed.options)
  } else if (verb === 'get') {
    if (parsed.positionals.length !== 1) throw new CliError('usage: tasks get TASK_ID')
    assertOptions(parsed.options, [])
    const taskId = await resolveTask(parsed.positionals[0])
    const task = await connect().tasks.get(taskId)
    result = { task, project: (await projects()).find(project => project.id === task.projectId) ?? null, runs: await connect().runs.byTask(taskId) }
  } else if (verb === 'create') {
    if (parsed.positionals.length > 0) throw new CliError('tasks create takes no positional arguments')
    result = await createTask(parsed.options)
  } else if (verb === 'update') {
    if (parsed.positionals.length !== 1) {
      throw new CliError('usage: tasks update TASK_ID [options]')
    }
    result = await updateTask(parsed.positionals[0], parsed.options)
  } else if (verb === 'send' || verb === 'send-back') {
    if (parsed.positionals.length !== 1) {
      throw new CliError(`usage: tasks ${verb} TASK_ID --message TEXT`)
    }
    result = await sendTask(verb, parsed.positionals[0], parsed.options)
  } else {
    if (parsed.positionals.length !== 1) {
      throw new CliError(`usage: tasks ${verb} TASK_ID`)
    }
    result = await taskAction(verb, parsed.positionals[0], parsed.options)
  }
  console.log(JSON.stringify(result, null, 2))
}

try {
  await main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`quuu: ${message}`)
  process.exitCode = error instanceof CliError ? error.exitCode : 1
}
 finally {
  if (client) await client.close().catch(() => { /* The primary command already reports a lost connection. */ })
}
