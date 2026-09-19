import type { ToolCall } from '../../../preload/api/session.js'
import { t } from './i18n/index.js'
import { compactCommand, compactPath, relativeToCwd } from './paths.js'
import { summarizePlan } from './planSummary.js'
import { toolKind } from './summarize.js'

export const ROLE_LABEL: Record<string, string> = {
  user: t('session.role.user'),
  assistant: t('session.role.assistant'),
  system: t('session.role.system')
}

export type Outcome = 'ok' | 'error' | 'pending'

export interface ToolDescription {
  /** The verb: "what was done". Not the raw tool name but a word you can read the meaning of. */
  verb: string
  /** "To what". Always keep the identifying part — a file name, a command. */
  target: string
  /** The complete value, for the tooltip. */
  full: string
  outcome: Outcome
  /** A single line that only means something on failure. */
  errorLine: string
}

/**
 * Tool name → verb.
 *
 * **Never surface the CLI's own name.** `exec_command` and `Bash` are the same thing, so
 * both have to read as "run". Without this mapping, swapping the CLI alone turns the
 * conversation surface into a list of English tool names and you can't tell whether
 * something was run or written.
 *
 * Keep the words to one uniform short length (two characters in Japanese). The verb column
 * is a vertical axis, and one long word mixed in breaks that axis.
 */
const VERB: Record<string, string> = {
  // claude
  Write: t('session.verb.create'),
  Edit: t('session.verb.edit'),
  MultiEdit: t('session.verb.edit'),
  NotebookEdit: t('session.verb.edit'),
  Read: t('session.verb.read'),
  NotebookRead: t('session.verb.read'),
  Bash: t('session.verb.run'),
  BashOutput: t('session.verb.output'),
  Grep: t('session.verb.search'),
  Glob: t('session.verb.search'),
  LS: t('session.verb.list'),
  Task: t('session.verb.delegate'),
  WebFetch: t('session.verb.fetch'),
  WebSearch: t('session.verb.search'),
  TodoWrite: t('session.verb.plan'),
  // codex
  exec: t('session.verb.run'),
  exec_command: t('session.verb.run'),
  shell: t('session.verb.run'),
  shell_command: t('session.verb.run'),
  write_stdin: t('session.verb.input'),
  wait: t('session.verb.wait'),
  apply_patch: t('session.verb.edit'),
  view_image: t('session.verb.image'),
  update_plan: t('session.verb.plan'),
  web_search: t('session.verb.search'),
  // copilot / cursor / grok
  read_file: t('session.verb.read'),
  create_file: t('session.verb.create'),
  edit_file: t('session.verb.edit'),
  str_replace_editor: t('session.verb.edit'),
  run_in_terminal: t('session.verb.run'),
  codebase_search: t('session.verb.search'),
  web_fetch: t('session.verb.fetch'),
  // agy
  run_command: t('session.verb.run'),
  command_status: t('session.verb.output'),
  send_command_input: t('session.verb.input'),
  view_file: t('session.verb.read'),
  write_to_file: t('session.verb.create'),
  replace_file_content: t('session.verb.edit'),
  multi_replace_file_content: t('session.verb.edit'),
  sed_file: t('session.verb.edit'),
  notebook_edit: t('session.verb.edit'),
  grep_search: t('session.verb.search'),
  find_by_name: t('session.verb.search'),
  search_web: t('session.verb.search'),
  read_url_content: t('session.verb.fetch'),
  list_dir: t('session.verb.list'),
  invoke_subagent: t('session.verb.delegate'),
  manage_task: t('session.verb.plan'),
  // opencode
  bash: t('session.verb.run'),
  read: t('session.verb.read'),
  write: t('session.verb.create'),
  edit: t('session.verb.edit'),
  patch: t('session.verb.edit'),
  grep: t('session.verb.search'),
  glob: t('session.verb.search'),
  list: t('session.verb.list'),
  webfetch: t('session.verb.fetch'),
  task: t('session.verb.delegate'),
  todowrite: t('session.verb.plan')
}

/**
 * The verb given to a tool whose name we don't know.
 *
 * Putting the tool name straight into the verb column lets a long name like
 * `mcp__chrome-devtools__click` push the 44px column open, and **the rows below stop
 * lining up vertically** (measured: Codex's `update_plan` and `shell_command` broke the
 * column). The name goes on the target side instead.
 */
const UNKNOWN_VERB = t('session.verb.call')

function pick(tool: ToolCall, ...keys: string[]): string | null {
  const input = tool.input
  if (!input || typeof input !== 'object') return null
  const record = input as Record<string, unknown>
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.length > 0) return value
    if (typeof value === 'number') return String(value)
  }
  return null
}

export function describeTool(tool: ToolCall, cwd: string | null, max = 48): ToolDescription {
  const outcome: Outcome = tool.isError ? 'error' : tool.result === null ? 'pending' : 'ok'
  const kind = toolKind(tool.name)
  const known = VERB[tool.name]
  const verb = known ?? UNKNOWN_VERB

  /*
   * A CLI whose input can't be picked up by key carries the value the parser resolved
   * (`target`). CLIs that can be picked up by key still are. **Parsing belongs to main;
   * this is presentation only.**
   */
  const given = tool.target && tool.target.length > 0 ? tool.target : null

  let full = ''
  let target = ''

  if (kind === 'write' || kind === 'read') {
    full = given ?? pick(tool, 'file_path', 'path', 'notebook_path') ?? ''
    target = compactPath(relativeToCwd(full, cwd), max)
  } else if (kind === 'shell') {
    full = given ?? pick(tool, 'command') ?? ''
    target = compactCommand(full, max)
  } else if (kind === 'search') {
    const pattern = given ?? pick(tool, 'pattern', 'query') ?? ''
    const path = pick(tool, 'path')
    full = path ? `${pattern}  in ${path}` : pattern
    target = compactCommand(
      path ? `${pattern} — ${compactPath(relativeToCwd(path, cwd), 24)}` : pattern,
      max
    )
  } else if (kind === 'agent') {
    full = given ?? pick(tool, 'description', 'prompt') ?? ''
    target = compactCommand(full, max)
  } else if (kind === 'web') {
    full = given ?? pick(tool, 'url', 'query') ?? ''
    target = compactCommand(full, max)
  } else if (kind === 'plan') {
    // A plan is an array of items. What you want to read is "what is happening now", so show the in-progress line
    full = given ?? summarizePlan(tool.plan ?? []) ?? ''
    target = compactCommand(full, max)
  } else {
    full = given ?? pick(tool, 'description', 'file_path', 'command', 'pattern', 'query', 'url') ?? ''
    /*
     * For a tool we don't know, the name is exactly the value worth reading.
     * Putting it in the verb column breaks the axis, so it goes at the head of the target
     */
    target = compactCommand(known ? full : `${tool.name}${full ? `  ${full}` : ''}`, max)
  }

  return {
    verb,
    target,
    full: full || (known ? '' : tool.name),
    outcome,
    errorLine: tool.isError && tool.result ? firstMeaningfulLine(tool.result) : ''
  }
}

function firstMeaningfulLine(text: string): string {
  const line = text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0)
  return line ? compactCommand(line, 120) : ''
}

/** Extension → highlighting language. Anything that maps to the same language is handled by `highlight`'s aliases */
const EXTENSION: Record<string, string> = {
  ts: 'ts',
  tsx: 'tsx',
  js: 'js',
  jsx: 'jsx',
  mjs: 'js',
  cjs: 'js',
  json: 'json',
  sh: 'sh',
  bash: 'sh',
  zsh: 'sh',
  py: 'python',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  c: 'c',
  h: 'c',
  cc: 'cpp',
  cpp: 'cpp',
  sql: 'sql',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'toml',
  html: 'html',
  xml: 'xml',
  svg: 'svg',
  css: 'css',
  scss: 'scss',
  patch: 'diff',
  diff: 'diff'
}

// `*** Begin Patch` is Codex's diff shape. It reads fine with unified-diff highlighting
const LOOKS_LIKE_DIFF = /^(?:diff --git |@@ -\d|\*\*\* (?:Begin Patch|(?:Add|Update|Delete) File: ))/m

/**
 * Which language to highlight a tool's result as.
 *
 * Results mix "a file that was read", "output that was run", and "a diff".
 * Which one it is follows from the tool and the content, so a human shouldn't have to
 * work it out every time.
 */
export function resultLanguage(tool: ToolCall): string {
  if (tool.result && LOOKS_LIKE_DIFF.test(tool.result)) return 'diff'
  if (toolKind(tool.name) !== 'read') return ''
  const path = pick(tool, 'file_path', 'path', 'notebook_path') ?? ''
  const extension = /\.([A-Za-z0-9]+)$/.exec(path)?.[1]?.toLowerCase() ?? ''
  return EXTENSION[extension] ?? ''
}

export function formatToolInput(input: unknown): string {
  if (typeof input === 'string') return input
  try {
    return JSON.stringify(input, null, 2)
  } catch {
    return String(input)
  }
}

/**
 * Which language to highlight a tool's input as.
 *
 * Input arrives as a string from Codex (either the diff itself, or JavaScript that calls
 * a tool). Without coloring it, opening it gives you **one indistinguishable slab of text**.
 * Anything that arrives as named values, like Claude's, stays JSON.
 */
export function inputLanguage(input: unknown): string {
  if (typeof input !== 'string') return 'json'
  if (LOOKS_LIKE_DIFF.test(input)) return 'diff'
  if (/\btools\.[A-Za-z_]|^\s*(?:const|let|await)\s/m.test(input)) return 'js'
  return ''
}
