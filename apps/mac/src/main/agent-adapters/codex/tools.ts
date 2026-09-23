import { t } from '../../i18n/index.js'
import type { PlanStep } from '../../session/plan.js'
import { readPlanSteps } from '../../session/plan.js'

/**
 * Decodes a Codex tool call down to "what, and against what".
 *
 * Unlike the other CLIs, Codex **does not write call payloads in a
 * machine-readable form**.
 *
 *   - Current shape: every tool is named `exec`. The payload is a JavaScript
 *     string calling `tools.<fn>({…})` (observed). The name alone can't tell
 *     a run from a write
 *   - Old shape: `function_call` carries `arguments` as a JSON **string**
 *   - Diffs: the target appears only in the `apply_patch` body (`*** Update File: …`)
 *
 * Without decoding this, the conversation pane shows only tool names and the
 * target column stays empty. That actually happened (Claude showed
 * "Read src/x.ts", Codex showed just "exec").
 *
 * **Decoding happens in this one place.** The screen side just reads the same
 * `name` and `target` as the other CLIs.
 */

export interface CodexTool {
  plan?: PlanStep[]
  /**
   * Normalized name. Aligned to the words the display side matches against
   * `toolKind` / `VERB` (`exec_command` `apply_patch` `view_image`
   * `update_plan` `web_search` …).
   * Whatever couldn't be decoded passes through with the CLI's name as-is.
   */
  name: string
  input: unknown
  target: string | null
  /**
   * Number pointing at a launched job (`wait({cell_id})`).
   *
   * The waiting side writes only the number, so **what is being waited on
   * vanishes from the row**. The number is unreadable to a human; expose it
   * here so it can be linked back to the call that started the job (the
   * parser does the linking).
   */
  cellId: string | null
}

/**
 * Works out the tool actually called from the `exec` payload (JavaScript).
 *
 * When runs are mixed (`exec_command` then `apply_patch`), take the
 * **first one**. The row only needs to say what kind of call this was;
 * enumerating everything doesn't fit on one line.
 */
const TOOL_CALL = /\btools\.([A-Za-z_][A-Za-z0-9_]*)\s*\(/

/** Extracts from just after `tools.<fn>(` up to the matching `)`. */
function callArguments(script: string, from: number): string {
  let depth = 0
  let quote = ''
  for (let i = from; i < script.length; i++) {
    const c = script[i]
    if (quote) {
      if (c === '\\') i++
      else if (c === quote) quote = ''
      continue
    }
    if (c === '"' || c === "'" || c === '`') quote = c
    else if (c === '(' || c === '{' || c === '[') depth++
    else if (c === ')' || c === '}' || c === ']') {
      depth--
      if (depth === 0) return script.slice(from + 1, i)
    }
  }
  return ''
}

/**
 * Reads a key's value out of the argument list.
 *
 * Codex writes JavaScript objects, so keys may lack quotes (`{cmd:"…"}`).
 * That's unreadable as JSON, so pick up only the string right after the key.
 * If the value is a variable (`tools.apply_patch(patch)`), give up and
 * return null.
 */
function argString(args: string, ...keys: string[]): string | null {
  for (const key of keys) {
    const at = new RegExp(`(?:^|[,{\\s])["']?${key}["']?\\s*:\\s*`).exec(args)
    if (!at) continue
    const value = readString(args, at.index + at[0].length)
    if (value !== null) return value
  }
  return null
}

/**
 * Reads a key's value as a string. Also reads unquoted values (`{cell_id:11}`).
 * Kept separate from `argString` (strings only) so numbers don't leak into
 * target strings.
 */
function argValue(args: string, key: string): string | null {
  const quoted = argString(args, key)
  if (quoted !== null) return quoted
  const bare = new RegExp(`(?:^|[,{\\s])["']?${key}["']?\\s*:\\s*(-?\\d+)`).exec(args)
  return bare ? bare[1] : null
}

/**
 * Extracts items from a plan written in the fragment
 * (`tools.update_plan({plan:[{step:"…",status:"…"}]})`).
 *
 * It's a JavaScript object with unquoted keys, unreadable as JSON.
 * Cut out each item's `{…}` in turn and read it key by key.
 */
function scriptPlanSteps(args: string): PlanStep[] {
  // Both quoted keys (`{"plan":[…]}`) and unquoted ones (`{plan:[…]}`) arrive
  const at = /\bplan["']?\s*:\s*\[/.exec(args)
  if (!at) return []

  const steps: PlanStep[] = []
  const list = args.slice(at.index + at[0].length)
  for (const item of objectChunks(list)) {
    const text = argString(item, 'step', 'content', 'title')
    const status = argString(item, 'status') ?? ''
    if (text || status) steps.push({ text, status })
  }
  return steps
}

/** Cuts out each `{…}` in the list, one at a time. Nesting and quoted content don't count. */
function objectChunks(text: string): string[] {
  const chunks: string[] = []
  let start = -1
  let depth = 0
  let quote = ''
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quote) {
      if (c === '\\') i++
      else if (c === quote) quote = ''
      continue
    }
    if (c === '"' || c === "'" || c === '`') quote = c
    else if (c === '{') {
      if (depth === 0) start = i
      depth++
    } else if (c === '}') {
      depth--
      if (depth === 0 && start >= 0) chunks.push(text.slice(start + 1, i))
      if (depth < 0) break
    } else if (c === ']' && depth === 0) break
  }
  return chunks
}

/** Reads from a quote-opening position up to the close as one string. */
function readString(text: string, from: number): string | null {
  const quote = text[from]
  if (quote !== '"' && quote !== "'" && quote !== '`') return null
  let out = ''
  for (let i = from + 1; i < text.length; i++) {
    const c = text[i]
    if (c === '\\') {
      const next = text[i + 1]
      out += next === 'n' ? '\n' : next === 't' ? '\t' : (next ?? '')
      i++
      continue
    }
    if (c === quote) return out
    out += c
  }
  return null
}

/**
 * Extracts the touched files from a `*** Begin Patch`-style diff.
 *
 * The target is written only in the patch body, so without reading it
 * "what was edited" vanishes from the screen.
 */
const PATCH_FILE = /^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm

function patchFiles(patch: string): string[] {
  const files: string[] = []
  for (const hit of patch.matchAll(PATCH_FILE)) {
    const path = hit[1]?.trim()
    if (path) files.push(path)
  }
  return files
}

/**
 * Extracts the diff body written inside the fragment.
 *
 * Codex holds the diff as a **JavaScript string** (`const patch = "*** Begin Patch\n…"`).
 * In the raw fragment newlines are the two characters `\n`, so reading it
 * as lines directly yields nothing (measured: overlooking this got targets
 * for only 1% of diffs). Re-read it as a string first, then hand it over.
 */
function patchLiteral(script: string): string | null {
  const at = script.indexOf('*** Begin Patch')
  if (at < 0) return null
  for (let i = at; i >= 0; i--) {
    const c = script[i]
    if (c === '"' || c === "'" || c === '`') return readString(script, i)
  }
  return null
}

function patchTarget(patch: string): string | null {
  const files = patchFiles(patch)
  if (files.length === 0) return null
  // One diff can touch several files. Say the first one plus a count of the rest
  return files.length === 1 ? files[0] : t('conversation.moreFiles', { file: files[0], count: files.length - 1 })
}

/** The command that was run. Flatten to one line whether string or array (`["bash","-lc","…"]`). */
function commandText(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) return value
  if (Array.isArray(value)) {
    const parts = value.filter((v): v is string => typeof v === 'string')
    if (parts.length === 0) return null
    /*
     * With `bash -lc "…"` it's the **content**, not the wrapper, one wants
     * to read. Shown wrapped, every row starts with `bash -lc` and nothing
     * is distinguishable
     */
    const last = parts[parts.length - 1]
    if (parts.length >= 2 && /^(?:ba)?sh$/.test(parts[0]) && last !== parts[0]) return last
    return parts.join(' ')
  }
  return null
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/**
 * Works out the tool name and target from the `exec` JavaScript.
 * If it can't be decoded, change neither name nor target (no lying rows).
 */
function fromScript(script: string): CodexTool {
  const hit = TOOL_CALL.exec(script)
  if (!hit) return { name: 'exec', input: script, target: firstLine(script), cellId: null }

  const name = hit[1]
  const args = callArguments(script, hit.index + hit[0].length - 1)
  return {
    name: normalize(name),
    input: script,
    target: targetFromArgs(name, args, script),
    ...(normalize(name) === 'update_plan' ? { plan: scriptPlanSteps(args) } : {}),
    cellId: argValue(args, 'cell_id')
  }
}

function targetFromArgs(name: string, args: string, script: string): string | null {
  switch (name) {
    case 'exec_command':
      return argString(args, 'cmd', 'command')
    case 'write_stdin':
      // Input into a running job. Knowing what was typed is enough (an empty send means waiting)
      return argString(args, 'chars') || t('conversation.awaitingMore')
    case 'apply_patch':
      // The argument can be a variable (`const patch = "…"; tools.apply_patch(patch)`)
      return patchTarget(argString(args, 'patch') ?? patchLiteral(script) ?? '')
    case 'view_image':
      return argString(args, 'path', 'url')
    case 'update_plan':
      // The plan is written inside the fragment. Without extracting it, only "plan" shows and the content vanishes
      return null
    case 'web__run':
    case 'web_search':
      // `open:[{ref_id:…}]` is a call opening a result, not a search. Show what was opened
      return argString(args, 'search_query', 'query', 'q', 'ref_id', 'url')
    default:
      return argString(args, 'cmd', 'command', 'path', 'file_path', 'query')
  }
}

function normalize(name: string): string {
  if (name === 'web__run' || name === 'search') return 'web_search'
  return name
}

function firstLine(text: string): string {
  return text.split('\n').find((l) => l.trim().length > 0)?.trim() ?? ''
}

/**
 * Aligns one Codex call to the same shape as the other CLIs (name, input, target).
 *
 * @param name tool name as written by the CLI
 * @param raw  `arguments` (JSON string) / `input` (JavaScript or patch) / object
 */
export function readCodexTool(name: string, raw: unknown): CodexTool {
  const input = parseArguments(raw)

  // The current shape. The tool name is always `exec`; the only clue is the JavaScript payload
  if (typeof input === 'string' && (name === 'exec' || TOOL_CALL.test(input))) {
    return fromScript(input)
  }

  const fields = record(input)
  const cellId = fields && ['string', 'number'].includes(typeof fields.cell_id)
    ? String(fields.cell_id)
    : null

  switch (name) {
    case 'apply_patch': {
      const patch = typeof input === 'string' ? input : (fields?.patch ?? '')
      return {
        name: 'apply_patch',
        input,
        target: typeof patch === 'string' ? patchTarget(patch) : null,
        cellId
      }
    }
    case 'shell':
    case 'shell_command':
    case 'local_shell_call':
      return {
        name: 'exec_command',
        input,
        target: fields ? commandText(fields.command ?? fields.cmd) : commandText(input),
        cellId
      }
    case 'view_image': {
      const path = fields?.path ?? fields?.url
      return { name, input, target: typeof path === 'string' ? path : null, cellId }
    }
    case 'update_plan':
      return { name, input, target: null, plan: readPlanSteps(input), cellId }
    default: {
      const guess = fields
        ? (['command', 'cmd', 'path', 'file_path', 'query', 'search_query'] as const)
          .map((k) => fields[k])
          .find((v) => typeof v === 'string' && v.length > 0)
        : null
      return {
        name: normalize(name),
        input,
        target: typeof guess === 'string' ? guess : commandText(fields?.command),
        cellId
      }
    }
  }
}

/** `arguments` arrives as a JSON **string**. If unreadable, pass the string through as-is. */
function parseArguments(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw ?? {}
  const trimmed = raw.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return raw
  try {
    return JSON.parse(trimmed)
  } catch {
    return raw
  }
}

/**
 * Strips the preamble every execution result carries.
 *
 *   Script completed
 *   Wall time 0.4 seconds
 *   Output:
 *   <body>
 *
 * Without stripping, every result starts with the same 3 lines and the
 * **body starts at line 4**. The first line of a collapsed row would also be
 * "Script completed" — no value to read. The failure marker (`Script failed`)
 * exists only here, so pick it up while stripping.
 */
const OUTPUT_HEADER = /^Script (completed|failed|running with cell ID \d+)\n(?:Wall time [^\n]*\n)?Output:\n*/

export interface CodexOutput {
  text: string
  isError: boolean
  /**
   * Number assigned to the launched job. **Appears only on this line.**
   * Picked up to turn a later `wait({cell_id})` into "what is being waited on".
   */
  cellId: string | null
}

// Look only at the preamble's first word (`Script ` is already consumed by OUTPUT_HEADER)
const RUNNING_CELL = /^running with cell ID (\d+)/

export function readCodexOutput(text: string): CodexOutput {
  const hit = OUTPUT_HEADER.exec(text)
  if (!hit) return { text, isError: false, cellId: null }
  return {
    text: text.slice(hit[0].length),
    isError: hit[1] === 'failed',
    cellId: RUNNING_CELL.exec(hit[1])?.[1] ?? null
  }
}
