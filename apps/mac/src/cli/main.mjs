#!/usr/bin/env node

import { Command, CommanderError, Option } from 'commander'
import { operationNames } from '../api/generated/operations.ts'

const program = new Command()
  .name('quuu')
  .description('Operate Quuu through its local gRPC server.')
  .addOption(new Option('-o, --output <format>', 'Output format: auto uses tables in a terminal and JSON for agents or pipes')
    .choices(['auto', 'json', 'table']).env('QUUU_OUTPUT').default('auto'))
  .option('--query <expression>', 'JMESPath query applied to the complete JSON result before formatting')
  .configureHelp({ showGlobalOptions: true })
  .showHelpAfterError()
  .exitOverride()
  .addHelpText('after', `
Examples:
  quuu projects list
  quuu projects list --query 'projects[].{name:name,path:path}'
  quuu tasks list --status review --output json
  quuu agents list --query '[].{id:id,name:name}'
  quuu describe rules.create
  quuu call settings.set '{"notifyOnReview":true}'

Environment:
  QUUU_OUTPUT            auto, json, or table (overridden by --output)
  QUUU_CONNECTION_FILE   Override the connection discovery file
  QUUU_URL / QUUU_TOKEN  Explicit gRPC endpoint and credential
  QUUU_USER_DATA         Override the Quuu data directory

JSON input: literal JSON, @FILE, or - for stdin. --json supplies INPUT;
--output json selects the OUTPUT format. Help never connects to Quuu.
Logs, stream and watch always emit JSONL.`)

// Parsing and help only load Commander and generated names, never the API runtime.
let runtime
async function api() { return runtime ??= await import('./runtime.mjs') }

async function output(command, operation, action) {
  const { prepareOutput } = await import('./output.ts')
  const print = prepareOutput(command.optsWithGlobals(), operation)
  print(await action())
}

function jsonOption(command) {
  return command.option('--json <input>', 'Operation input as JSON, @FILE, or - for stdin')
}

program.command('api').description('List every available operation').action(async (_options, command) => {
  await output(command, 'api', () => operationNames)
})
program.command('describe <operation>').description('Show an operation’s input and output JSON schemas')
  .action(async (name, _options, command) => {
    await output(command, 'describe', async () => (await api()).describeOperation(name))
  })
program.command('config').description('Show local endpoints and private MCP credentials')
  .action(async (_options, command) => {
    await output(command, 'config', async () => (await api()).configuration())
  })
program.command('call <operation> [input]').description('Call any operation with JSON, @FILE, or stdin (-)')
  .action(async (name, input, _options, command) => {
    if (!operationNames.includes(name)) throw new Error(`Unknown operation: ${name}`)
    await output(command, name, async () => (await api()).callOperation(name, input))
  })

function assertStreamingOptions(command) {
  const options = command.optsWithGlobals()
  if (options.query !== undefined) throw new Error('--query is unavailable for JSONL streams; use tasks list or call logs.page to query a JSON result')
  if (options.output === 'table') throw new Error('This command emits JSONL; --output table is unavailable')
}
for (const name of ['stream', 'watch']) {
  program.command(name).description(name === 'stream' ? 'Read JSONL commands and emit replies and events in one session' : 'Stream app events as JSONL')
    .action(async (_options, command) => {
      assertStreamingOptions(command)
      await (await api()).streamCommands(name === 'watch')
    })
}

const projects = program.command('projects').alias('project').description('Inspect and configure projects')
const tasks = program.command('tasks').alias('task').description('Inspect and operate the task queue')

function shortcut(parent, name, description, operation, takesId = false) {
  const command = jsonOption(parent.command(name).description(description))
  if (takesId) command.argument('[task-id]', 'Task ID or unique prefix (required unless using --json)')
  command.action(async (...args) => {
    const cmd = args.at(-1)
    const options = cmd.opts()
    const reference = takesId ? cmd.processedArgs[0] : undefined
    if (options.json !== undefined) {
      if (reference !== undefined || Object.keys(options).some(key => key !== 'json')) {
        throw new Error('--json cannot be combined with task arguments or shortcut options')
      }
      await output(cmd, operation, async () => (await api()).callOperation(operation, options.json))
    } else {
      if (takesId && !reference) throw new Error('A task ID or unique prefix is required')
      if (parent === tasks && name === 'create') {
        for (const key of ['project', 'title']) if (!options[key]) throw new Error(`--${key} is required`)
      }
      await output(cmd, operation, async () => (await api()).shortcut(parent.name(), name, reference, options))
    }
  })
  return command
}

shortcut(projects, 'list', 'List projects', 'projects.list')
  .addHelpText('after', "\nExample: quuu projects list --query 'sort_by(projects, &name)[].{name:name,path:path}'")
shortcut(tasks, 'list', 'List all matching tasks (fetches every page)', 'tasks.list')
  .option('--project <id|name|path>', 'Select a project by exact ID, name, or path')
  .addOption(new Option('--status <status>', 'Filter by task status').choices(['draft', 'held', 'queued', 'running', 'review', 'failed', 'done']))
  .option('--include-archived', 'Include archived tasks')
  .addHelpText('after', "\nExample: quuu tasks list --query 'tasks[?status==`review`].{id:id,title:title}'")
shortcut(tasks, 'get', 'Show a task, its project, and run history', 'tasks.get', true)

function editOptions(command) {
  return command
    .option('--project <id|name|path>', 'Project ID, name, or path (required for create)')
    .option('--title <text>', 'Task title (required for create)')
    .addOption(new Option('--prompt <text>', 'Instruction body').conflicts('promptFile'))
    .option('--prompt-file <path>', 'Read instruction body from a file or - for stdin')
    .addOption(new Option('--priority <0|1|2|3>', 'Priority (create default: 2)').choices(['0', '1', '2', '3']))
    .option('--scheduled-at <ISO8601>', 'Schedule execution')
    .option('--agent <id>', 'Bind an agent and its compatible fallback chain')
}
editOptions(shortcut(tasks, 'create', 'Create and queue a task', 'tasks.create'))
  .addOption(new Option('--status <status>', 'Initial status (default: queued)').choices(['draft', 'held', 'queued']))
editOptions(shortcut(tasks, 'update', 'Update a task', 'tasks.update', true))
  .addOption(new Option('--clear-schedule', 'Remove the schedule').conflicts('scheduledAt'))
  .addOption(new Option('--clear-agent', 'Remove the agent override').conflicts('agent'))
  .option('--review-note <text>', 'Update the review note')
for (const [name, operation, description] of [
  ['enqueue', 'enqueue', 'Place a task in the queue'],
  ['unqueue', 'unqueue', 'Remove a task from the queue'],
  ['hold', 'hold', 'Hold a task'],
  ['run', 'runNow', 'Request an immediate run'],
  ['done', 'markDone', 'Approve completion (human decision)'],
  ['reopen', 'reopen', 'Reopen a task'],
  ['cancel', 'cancel', 'Cancel a running task'],
  ['archive', 'archive', 'Archive a task'],
  ['unarchive', 'archive', 'Unarchive a task'],
  ['delete', 'remove', 'Delete a task'],
]) shortcut(tasks, name, description, `tasks.${operation}`, true)
for (const [name, operation] of [['send', 'send'], ['send-back', 'sendBack']]) {
  shortcut(tasks, name, name === 'send' ? 'Send or reserve a follow-up message' : 'Return work to the queue with a follow-up', `tasks.${operation}`, true)
    .addOption(new Option('--message <text>', 'Follow-up message').conflicts('messageFile'))
    .option('--message-file <path>', 'Read follow-up from a file or - for stdin')
}
tasks.commands.find(command => command.name() === 'send-back').alias('sendBack')
tasks.command('logs <task-id>').description('Export structured session history as JSONL')
  .option('--all', 'Export every recorded conversation')
  .option('--search <text>', 'Filter messages by text')
  .option('--run <id>', 'Export one run belonging to this task')
  .action(async (reference, options, command) => {
    assertStreamingOptions(command)
    await (await api()).shortcut('tasks', 'logs', reference, options)
  })

// Generate the remaining command tree from the same contract as gRPC and MCP.
for (const operation of operationNames) {
  const parts = operation.split('.')
  let parent = program
  for (const part of parts.slice(0, -1)) {
    parent = parent.commands.find(command => command.name() === part) ?? parent.command(part).description(`${part} operations`)
  }
  const verb = parts.at(-1)
  const name = verb.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)
  if (parent.commands.some(command => command.name() === name)) continue
  const command = jsonOption(parent.command(`${name} [input]`).description(`Call ${operation}; see quuu describe ${operation} for its JSON input`))
  if (name !== verb) command.alias(verb)
  command.action(async (input, options, cmd) => {
    if (input !== undefined && options.json !== undefined) throw new Error('Provide JSON as an argument or --json, not both')
    await output(cmd, operation, async () => (await api()).callOperation(operation, options.json ?? input))
  })
}

// A closed pipe is normal when a caller reads only the first few lines.
process.stdout.on('error', error => {
  if (error.code === 'EPIPE') process.exit(0)
  else throw error
})
try {
  if (process.argv.length === 2) program.outputHelp()
  else await program.parseAsync()
} catch (error) {
  if (error instanceof CommanderError) process.exitCode = error.exitCode
  else {
    console.error(`quuu: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
} finally {
  await runtime?.closeClient()
}
