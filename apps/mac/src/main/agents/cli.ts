/**
 * Quuu's CLI identity and interactive-resume queries. Native command syntax is
 * owned by the individual drivers in agent-clis; provider output by agent-adapters.
 * User templates describe non-interactive runs and must not be reused for human takeover.
 */

import { cliForCommand, cliForId } from '../agent-clis/registry.js'
import type { LogAdapter } from './cliAdapter.js'


/** The template element that stands for the prompt. Only a bare one can be moved or joined. */
const PROMPT = '{{prompt}}'

/**
 * Rewrite an argument template so the CLI cannot read the prompt as an option.
 *
 * Applied when a definition is saved and to the definitions already stored (schema v18), so what
 * the settings screen shows is what actually runs. It is a **repair, not a policy**: an unknown
 * CLI, a prompt already spelled as a value, or a template that already ends the option grammar
 * itself is returned untouched, and running it twice changes nothing the second time.
 */
export function promptAsValue(command: string, template: readonly string[]): string[] {
  const args = [...template]
  const style = cliForCommand(command)?.prompt
  if (!style || style.kind === 'value' || style.kind === 'bare') return args
  // Two prompts in one line is a shape we cannot rearrange without guessing which one is meant
  if (args.filter((arg) => arg === PROMPT).length !== 1) return args
  const index = args.indexOf(PROMPT)

  if (style.kind === 'attached') {
    // Only the flag that introduces the prompt may be folded into it
    if (!style.flags.includes(args[index - 1])) return args
    return [...args.slice(0, index - 1), `${style.as}=${PROMPT}`, ...args.slice(index + 1)]
  }

  const rest = [...args.slice(0, index), ...args.slice(index + 1)]
  // A hand-written `--` already says where the grammar ends. Moving the prompt past it would change
  // which arguments the user meant to hand over
  if (rest.includes('--')) return args
  return [...rest, '--', PROMPT]
}

export interface ResumeInvocation {
  command: string
  args: string[]
  /** The CLI's name as shown on screen (the "Claude Code ..." part). */
  cliName: string
}

export interface ResumeSource {
  /** The command the run used. A full path is fine. */
  command?: string | null
  /** How the session log is read. The clue for when the command is unknown. */
  adapter?: LogAdapter | null
  sessionId?: string | null
}

/** Pull `claude` out of `/opt/homebrew/bin/claude` (the renderer comes through here too, so no node:path). */
function basename(command: string): string {
  return command.split('/').filter(Boolean).pop() ?? ''
}

/**
 * Same CLI? `/opt/homebrew/bin/claude` and `claude` count as the same thing.
 *
 * **A session belongs to its CLI**, and both where it lives and how it resumes differ per CLI.
 * Handing a conversation ID Codex opened to `claude --resume` continues nothing; it dies with
 * "no such conversation". If either side is empty (unknown), they cannot be called the same.
 */
export function sameCli(a: string, b: string): boolean {
  const x = basename(a.trim())
  const y = basename(b.trim())
  return x.length > 0 && x === y
}

/** The CLI's name as shown on screen. An unknown command is returned as-is. */
export function cliLabel(command: string): string {
  const name = basename(command.trim())
  return cliForCommand(name)?.name ?? name
}

/**
 * The launch shape for reopening interactively. null when it cannot be built.
 *
 * It comes out null in two cases: no session ID, and an unknown CLI.
 * Pressing either does nothing, so **the caller does not offer an operation that is null here**.
 */
export function resumeInvocation(source: ResumeSource): ResumeInvocation | null {
  const sessionId = source.sessionId?.trim() ?? ''
  if (sessionId.length === 0) return null

  const command = source.command?.trim() ?? ''
  const known = cliForCommand(command)
  if (known) return { command, args: known.resume(sessionId), cliName: known.name }

  // Only when the record has no command (an imported session), decide the CLI from the adapter
  const cli = source.adapter ? cliForId(source.adapter) : null
  if (!cli) return null
  return { command: cli.command, args: cli.resume(sessionId), cliName: cli.name }
}
