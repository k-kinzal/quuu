/**
 * Which allowance a limit spent.
 *
 * One CLI is not one allowance. Claude's account runs out as a whole, and one model's share can
 * run out on its own - "You've reached your Fable limit. Switch to another model" - while every
 * other model on the same account still answers. Cursor splits its own models from the rest the
 * same way. Who has to wait a limit out, and how the moment it lifts can be worked out, both follow
 * from which of these it was, so the adapter that knows its CLI's wording reads it once and
 * everything after that reads the scope, never the sentence.
 *
 * It is read from the message the run keeps, so a run from last week is read exactly the way the
 * one that just ended was.
 */
export type LimitScope =
  /** The account's own allowance: every model on it is out. */
  | { kind: 'account' }
  /** One model's share of the account. The other models on it are not affected. */
  | { kind: 'model'; model: string }
  /**
   * The wording names no allowance at all: an overload, a model at capacity, a bare 429. Those
   * pass, and they can be one model's trouble, so nothing but the definition that met one is held
   * back by it.
   */
  | { kind: 'unstated' }

/**
 * An allowance the account ran out of, in the words CLIs use for it: Claude's "session limit" and
 * "weekly limit", Codex's "You've hit your usage limit", a spent quota or credit balance.
 */
const ACCOUNT_ALLOWANCE =
  /\b(?:usage|session|weekly|daily|monthly|hourly|spend(?:ing)?)\s+limit\b|\bquota\b|insufficient\b.*\bcredit|out of credits/i

/** For a CLI whose wording never tells one model's share apart from the account. */
export function readLimitScope(message: string): LimitScope {
  return ACCOUNT_ALLOWANCE.test(message) ? { kind: 'account' } : { kind: 'unstated' }
}

/**
 * The model a definition's arguments select: `--model <name>`, `--model=<name>` or `-m <name>`.
 * null when they leave it to the CLI's default, which Quuu cannot see.
 */
export function modelArgument(args: readonly string[]): string | null {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg.startsWith('--model=')) return arg.slice('--model='.length) || null
    if ((arg === '--model' || arg === '-m') && i + 1 < args.length) return args[i + 1]
  }
  return null
}

/**
 * Does a definition that selects `selected` draw on that allowance?
 *
 * A message names the model the way people do ("Fable"), and a definition selects it however the
 * CLI accepts it ("fable", "claude-fable-5-1", "opus[1m]"), so the name is looked for as one word of
 * the selection. A definition left on the CLI's default is not assumed to be on any model.
 */
export function drawsOn(scope: LimitScope, selected: string | null): boolean {
  if (scope.kind !== 'model') return scope.kind === 'account'
  if (selected === null) return false
  return selected.toLowerCase().split(/[^a-z0-9]+/).includes(scope.model.toLowerCase())
}
