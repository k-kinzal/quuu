/**
 * Which allowance a limit spent.
 *
 * One CLI is not one allowance. Claude's account runs out as a whole, and one model's share can
 * run out on its own - "You've reached your Fable limit. Switch to another model" - while every
 * other model on the same account still answers. Cursor splits its own models from the rest the
 * same way. Who has to wait a limit out, and how the moment it lifts can be worked out, both follow
 * from which of the two it was, so the adapter that knows its CLI's wording reads it once and
 * everything after that reads the scope, never the sentence.
 *
 * It is read from the message the run keeps, so a run from last week is read exactly the way the
 * one that just ended was.
 */
export type LimitScope =
  /** The account's own allowance: every model on it is out. Also what a limit that names nothing reads as. */
  | { kind: 'account' }
  /** One model's share of the account. The other models on it are not affected. */
  | { kind: 'model'; model: string }

const ACCOUNT: LimitScope = { kind: 'account' }

/** For a CLI whose wording never tells one model's share apart from the account. */
export function accountWide(): LimitScope {
  return ACCOUNT
}
