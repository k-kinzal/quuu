import { execFile } from 'node:child_process'
import { chmodSync, cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { humanOutput, outputFormat } from '../src/cli/output.js'
import { operationNames } from '../src/api/generated/operations.js'
import { operations } from '../src/api/catalog.js'

const execute = promisify(execFile)
const cli = resolve(import.meta.dirname, '../bin/quuu')
const env = { ...process.env, QUUU_CONNECTION_FILE: '/nonexistent/quuu-cli-test/connections.json', QUUU_URL: '', QUUU_TOKEN: '', QUUU_OUTPUT: 'auto' }

describe('CLI help and argument validation', () => {
  it.each([
    [], ['--help'], ['-h'], ['help'], ['projects', '--help'], ['projects', 'list', '--help'],
    ['tasks', 'create', '-h'], ['agents', 'list', '--help'], ['settings', 'set', '--help'],
    ['call', '--help'], ['stream', '--help'], ['project', 'list', '-h'],
  ])('shows help without a running app for %j', async (...args) => {
    const result = await execute(cli, args, { env })
    expect(result.stderr).toBe('')
    expect(result.stdout).toContain('Usage: quuu')
    expect(result.stdout).toContain('--output')
  })

  it.each([
    [['projects', 'list', '--wat'], 'unknown option'],
    [['projects', 'list', 'extra'], 'too many arguments'],
    [['tasks', 'list', '--project'], 'argument missing'],
    [['tasks', 'list', '--status', 'unknown'], 'invalid'],
    [['tasks', 'create', '--priority', '9'], 'invalid'],
    [['tasks', 'create', '--project', 'missing'], '--title is required'],
    [['tasks', 'get'], 'task ID'],
    [['projects', 'list', '-o', 'yaml'], 'invalid'],
    [['tasks', 'update', 'id', '--clear-agent', '--agent', 'id'], 'cannot be used'],
    [['tasks', 'create', '--prompt', 'text', '--prompt-file', '-'], 'cannot be used'],
    [['tasks', 'get', 'id', '--json', '"id"'], 'cannot be combined'],
    [['projects', 'list', '--query', '['], 'Invalid --query'],
    [['watch', '--query', '@'], 'unavailable for JSONL'],
    [['tasks', 'logs', 'id', '--output', 'table'], 'emits JSONL'],
  ])('rejects invalid arguments before connecting: %j', async (args, message) => {
    const result: unknown = await execute(cli, args, { env }).catch((error: unknown) => error)
    expect(result).toMatchObject({ code: 1, stdout: '' })
    expect(result).toHaveProperty('stderr', expect.stringContaining(message))
  })

  it('keeps the fast catalog complete and supports queries and global options on either side of a command', async () => {
    expect(operationNames).toEqual(operations().map(operation => operation.name))
    const first = await execute(cli, ['--output', 'json', '--query', 'length(@)', 'api'], { env })
    const last = await execute(cli, ['api', '--query=length(@)', '-ojson'], { env: { ...env, QUUU_OUTPUT: 'table' } })
    expect(JSON.parse(first.stdout)).toBe(operationNames.length)
    expect(last.stdout).toBe(first.stdout)
  })

  it('runs on the app’s own runtime inside Quuu.app when Node is not on PATH', async () => {
    const contents = mkdtempSync(join(tmpdir(), 'quuu-bundle-'))
    try {
      const bin = join(contents, 'Resources', 'bin')
      mkdirSync(bin, { recursive: true })
      mkdirSync(join(contents, 'MacOS'))
      cpSync(resolve(import.meta.dirname, '../out/cli/quuu.mjs'), join(bin, 'quuu.mjs'))
      cpSync(cli, join(bin, 'quuu'))
      // Stands in for Quuu's executable: runs the script only when asked to behave as Node
      writeFileSync(join(contents, 'MacOS', 'Quuu'), `#!/bin/sh\n[ "$ELECTRON_RUN_AS_NODE" = 1 ] || exit 9\nexec "${process.execPath}" "$@"\n`)
      chmodSync(join(contents, 'MacOS', 'Quuu'), 0o755)
      const result = await execute(join(bin, 'quuu'), ['tasks', 'list', '--help'], { env: { ...env, PATH: '/usr/bin:/bin' } })
      expect(result.stdout).toContain('--query')
    } finally { rmSync(contents, { recursive: true, force: true }) }
  })

  it('can display help with all lazy runtime chunks absent', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'quuu-help-'))
    try {
      cpSync(resolve(import.meta.dirname, '../out/cli/quuu.mjs'), join(directory, 'quuu.mjs'))
      cpSync(cli, join(directory, 'quuu'))
      const result = await execute(join(directory, 'quuu'), ['tasks', 'list', '--help'], { env })
      expect(result.stdout).toContain('--query')
      expect(result.stderr).toBe('')
    } finally { rmSync(directory, { recursive: true, force: true }) }
  })
})

describe('CLI operation input', () => {
  // Input is read before connecting, so without an app the error says which one happened
  const fails = (args: string[]): Promise<unknown> => execute(cli, args, { env }).catch((error: unknown) => error)

  it('reads a single ID bare, as it is first written', async () => {
    for (const args of [['projects', 'remove', 'prj_quuu'], ['agents', 'reset-limit', 'agt_1'], ['projects', 'remove', '"prj_quuu"']]) {
      expect(await fails(args)).toHaveProperty('stderr', expect.stringContaining('Cannot read Quuu connection settings'))
    }
  })

  it('still reads JSON for every other input', async () => {
    expect(await fails(['settings', 'set', 'theme'])).toHaveProperty('stderr', expect.stringMatching(/not valid JSON/))
  })
})

describe('CLI output selection', () => {
  it('uses tables for human terminals and JSON for pipes', () => {
    expect(outputFormat({}, {}, true)).toBe('table')
    expect(outputFormat({}, {}, false)).toBe('json')
  })
  it.each(['QUUU_RUN_ID', 'CODEX_THREAD_ID', 'CODEX_CI', 'CLAUDECODE', 'CURSOR_AGENT'])('recognizes %s even in an agent PTY', key => {
    expect(outputFormat({}, { [key]: '1' }, true)).toBe('json')
    expect(outputFormat({ output: 'table' }, { [key]: '1' }, false)).toBe('table')
    expect(outputFormat({}, { [key]: '' }, true)).toBe('table')
    expect(outputFormat({}, { [key]: 'false' }, true)).toBe('table')
  })
  it('honors explicit JSON in a human terminal', () => {
    expect(outputFormat({ output: 'json' }, {}, true)).toBe('json')
  })
  it('renders readable Unicode tables, empty lists, and nested details without terminal escapes', () => {
    const output = humanOutput({ projects: [{ name: '日本語', path: '/tmp/日本語' }, { name: '\x1b[31mred\x1b[0m\nline', path: '/tmp/other' }] })
    expect(output).toContain('NAME')
    expect(output).toContain('日本語')
    expect(output).toContain('/tmp/日本語')
    expect(output).toContain('red line')
    expect(output).not.toContain('\x1b')
    expect(humanOutput([])).toBe('No results.')
    expect(humanOutput({ result: { ok: false }, values: [0, false, null] })).toContain('ok: false')
    expect(humanOutput(undefined)).toBe('OK')
  })
})
