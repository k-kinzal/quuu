/**
 * How each CLI is called: the arguments that reopen a stopped session by hand, and the spelling
 * that keeps a prompt a prompt.
 *
 * Each shape was confirmed by running that CLI on this machine (the same basis as the
 * non-interactive side of `seed.ts`).
 *
 * The runs Quuu launches are **non-interactive** (`-p`: run once and exit). For a human to take
 * one over, the same session has to be reopened **interactively**, and those arguments differ per
 * CLI. This is the one place where main (which actually launches) and the renderer (which decides
 * whether to offer the operation at all) go through the same judgement.
 *
 * **The agent definition's `resumeArgsTemplate` cannot be used.** That shape exists to pass a
 * follow-up and finish in one shot (`-p` / `--force` / `bypassPermissions`); run in a terminal
 * as-is it exits before a human can type anything.
 *
 * Where sessions are left is owned by `main/session/logAdapters.ts`.
 * This file owns only **how to call the same CLI back**. Support for a new CLI goes into both.
 */

import type { LogAdapter } from './cliAdapter.js'

/**
 * How a prompt reaches the CLI **as text**.
 *
 * A prompt is whatever the human typed. Starting a message with `--cached`, or writing one that
 * happens to be exactly `review`, is ordinary English — but the CLI's parser sees an option it
 * does not know, or a subcommand, and exits before the agent starts. Which spelling ends that
 * grammar depends on whether the prompt is a positional or an option's value.
 */
type PromptStyle =
  /** A positional. `--` ends the option grammar, so the prompt goes last, behind it. */
  | { kind: 'positional' }
  /**
   * The value of an option. `--` would leave the option with nothing to take (clap reads it as
   * "no value supplied"), so the value is joined onto the long spelling with `=` instead.
   */
  | { kind: 'attached'; flags: string[]; as: string }
  /** The option swallows the next argument whatever it looks like. There is nothing to respell. */
  | { kind: 'value' }
  /**
   * A positional with **no way to end the option grammar**.
   *
   * `opencode run -- <prompt>` does not hand the prompt over: with `--` the CLI repeats the
   * message or waits forever (measured on v2.0.8), and it has no option that takes a prompt as a
   * value. There is nothing to rewrite, so a prompt opening with `-` is read as an option and
   * that run dies before the agent starts.
   */
  | { kind: 'bare' }

interface Cli {
  /** The CLI's name as shown on screen. */
  name: string
  /** The arguments that reopen that session interactively. */
  resume(sessionId: string): string[]
  /** How this CLI is handed a prompt that looks like an option. */
  prompt: PromptStyle
}

/**
 * Command name -> how to call it back.
 *
 * The key is the command name rather than the adapter because **the CLI itself decides how it is
 * called**. A user definition may choose stdout, but the resume arguments follow the command that
 * was actually invoked (`codex` and so on), not how the log is read.
 */
const CLIS: Record<string, Cli> = {
  // `-p/--print` is a flag; the prompt itself is a positional
  claude: { name: 'Claude Code', resume: (id) => ['--resume', id], prompt: { kind: 'positional' } },
  // Codex alone takes a subcommand (`codex resume <SESSION_ID>`)
  codex: { name: 'Codex', resume: (id) => ['resume', id], prompt: { kind: 'positional' } },
  'cursor-agent': {
    name: 'Cursor',
    resume: (id) => ['--resume', id],
    // Same as Claude Code: `-p/--print` is a flag, the prompt is a positional
    prompt: { kind: 'positional' }
  },
  grok: {
    name: 'Grok',
    resume: (id) => ['--resume', id],
    /*
     * Grok is the one that takes the prompt as an option value (`-p, --single <PROMPT>`), and clap
     * refuses to fill a value from a `-`-leading token — it even suggests `--`, which here only
     * produces "a value is required for '--single'". Joined with `=` it is read as text.
     */
    prompt: { kind: 'attached', flags: ['-p', '--single'], as: '--single' }
  },
  agy: {
    name: 'Antigravity',
    // The CLI's own word for a session is a conversation
    resume: (id) => ['--conversation', id],
    /*
     * `--print` **takes the prompt as its value**. Written separately it swallows whatever comes
     * next and says so ("--print took \"--dangerously-skip-permissions\" as its prompt" - measured),
     * and it tells you the same fix: attach it with `=`. Joined that way any text is read as text.
     */
    prompt: { kind: 'attached', flags: ['-p', '--print', '--prompt'], as: '--print' }
  },
  opencode: {
    name: 'opencode',
    resume: (id) => ['--session', id],
    // The prompt is a bare positional. See the `bare` style above for why nothing can be respelled
    prompt: { kind: 'bare' }
  },
  copilot: {
    name: 'GitHub Copilot',
    /*
     * Copilot's `--resume` alone joins with `=`. Its help spells it `--resume[=value]`, and written
     * separately the ID is not read as its argument (same as the non-interactive side of `seed.ts`).
     */
    resume: (id) => [`--resume=${id}`],
    // `-p, --prompt <text>` takes the next argument as-is, `--help` included. Nothing to respell
    prompt: { kind: 'value' }
  }
}

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
  const style = CLIS[basename(command.trim())]?.prompt
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

/**
 * Adapter -> command name.
 *
 * An imported session (one started directly outside Quuu) has no recorded command. Which CLI
 * wrote the log is known, so it is looked up from that.
 */
const ADAPTER_COMMAND: Record<LogAdapter, string | null> = {
  claude: 'claude',
  codex: 'codex',
  cursor: 'cursor-agent',
  grok: 'grok',
  copilot: 'copilot',
  agy: 'agy',
  opencode: 'opencode',
  // A stdout log Quuu wrote itself. It names no CLI
  stdout: null
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
  return CLIS[name]?.name ?? name
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
  const known = CLIS[basename(command)]
  if (known) return { command, args: known.resume(sessionId), cliName: known.name }

  // Only when the record has no command (an imported session), decide the CLI from the adapter
  const fallback = source.adapter ? ADAPTER_COMMAND[source.adapter] : null
  if (!fallback) return null
  const cli = CLIS[fallback]
  return { command: fallback, args: cli.resume(sessionId), cliName: cli.name }
}
