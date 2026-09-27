import { accountWide, type LimitScope } from '../limitScope.js'

/**
 * A limit on one model rather than on the account: "You've reached your **Fable** limit."
 *
 * The model's name is what tells it apart from "You've reached your usage limit", which is the
 * account's own five-hour window - a different length of wait entirely, and one that always prints
 * the moment it lifts. A model is a proper noun and those windows are not, so the capital is the
 * test, with the common nouns a message may still capitalize ruled out by name.
 */
const MODEL_LIMIT = /reached your ([A-Z][\w.+-]*) limit/
const NOT_A_MODEL = new Set([
  'Usage', 'Weekly', 'Daily', 'Monthly', 'Hourly', 'Rate', 'Session', 'Account', 'Plan', 'Team',
  'Spend', 'Credit', 'Credits', 'Organization', 'Token', 'Context'
])

/** Which allowance that message says is spent: one model's share, or the account. */
export function claudeLimitScope(message: string): LimitScope {
  const named = MODEL_LIMIT.exec(message)
  return named !== null && !NOT_A_MODEL.has(named[1]) ? { kind: 'model', model: named[1] } : accountWide()
}
