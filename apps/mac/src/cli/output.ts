import { stripVTControlCharacters } from 'node:util'
import Table from 'cli-table3'
import jmespath from 'jmespath'

// Upstream exports compile, but @types/jmespath only declares search.
declare module 'jmespath' {
  export function compile(expression: string): unknown
}

export interface OutputOptions {
  output?: 'auto' | 'json' | 'table'
  query?: string
}

export function outputFormat(options: OutputOptions, env: NodeJS.ProcessEnv, isTTY: boolean): 'json' | 'table' {
  if (options.output && options.output !== 'auto') return options.output
  // QUUU_RUN_ID covers every provider launched by Quuu, including agent PTYs.
  const agent = ['QUUU_RUN_ID', 'CODEX_THREAD_ID', 'CODEX_CI', 'CLAUDECODE', 'CURSOR_AGENT']
    .some(key => env[key] && !['0', 'false'].includes(env[key].toLowerCase()))
  return agent || !isTTY ? 'json' : 'table'
}

const columns: Record<string, string[]> = {
  'projects.list': ['id', 'name', 'path', 'enabled'],
  'tasks.list': ['id', 'status', 'priority', 'title', 'projectId'],
  'agents.list': ['id', 'name', 'command', 'enabled'],
  'groups.list': ['id', 'name', 'strategy', 'memberIds'],
  'rules.list': ['id', 'name', 'projectId', 'enabled', 'frequency'],
  'runs.byTask': ['id', 'status', 'agentId', 'startedAt', 'endedAt'],
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function cell(value: unknown): string {
  const text = value == null ? '-' : typeof value === 'string' ? value : JSON.stringify(value) ?? '-'
  // Data may contain terminal escape sequences; JSON output remains lossless.
  return stripVTControlCharacters(text).split('').map(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 ? ' ' : char).join('')
}

export function humanOutput(value: unknown, fields?: string[]): string {
  if (Array.isArray(value)) {
    if (!value.length) return 'No results.'
    if (!value.every(record)) return value.map(item => record(item) || Array.isArray(item) ? humanOutput(item) : cell(item)).join('\n')
    const keys = fields ?? [...new Set(value.flatMap(item => Object.keys(item)))]
    if (!keys.length) return value.map(() => '{}').join('\n')
    const table = new Table({
      head: keys.map(key => cell(key).toUpperCase()),
      style: { head: [], border: [], 'padding-left': 0, 'padding-right': 2, compact: true },
      chars: { top: '', 'top-mid': '', 'top-left': '', 'top-right': '', bottom: '', 'bottom-mid': '', 'bottom-left': '', 'bottom-right': '', left: '', 'left-mid': '', mid: '', 'mid-mid': '', right: '', 'right-mid': '', middle: '' },
    })
    for (const item of value) table.push(keys.map(key => cell(item[key])))
    return table.toString().split('\n').map(line => line.trimEnd()).join('\n')
  }
  if (record(value)) {
    return Object.entries(value).map(([key, item]) => {
      if (record(item) || Array.isArray(item)) return `${cell(key)}:\n${humanOutput(item, fields).split('\n').map(line => `  ${line}`).join('\n')}`
      return `${cell(key)}: ${cell(item)}`
    }).join('\n') || '{}'
  }
  return value === undefined ? 'OK' : cell(value)
}

export function prepareOutput(options: OutputOptions, operation: string): (value: unknown) => void {
  const format = outputFormat(options, process.env, process.stdout.isTTY === true)
  if (options.query !== undefined) {
    try { jmespath.compile(options.query) }
    catch (error) { throw new Error(`Invalid --query: ${error instanceof Error ? error.message : String(error)}`) }
  }
  return value => {
    let result = value
    if (options.query !== undefined) {
      try { result = jmespath.search(value ?? null, options.query) as unknown }
      catch (error) { throw new Error(`Command completed, but --query failed: ${error instanceof Error ? error.message : String(error)}`) }
    }
    console.log(format === 'json' ? JSON.stringify(result ?? null, null, 2) : humanOutput(result, options.query === undefined ? columns[operation] : undefined))
  }
}
