/**
 * The default patterns for detecting a limit. Overridable per agent definition.
 * "Silently stopping at a limit while running unattended" is the worst failure mode, so the
 * matching is deliberately broad and errs towards falling back.
 *
 * **The UI reads these too.** What is in force while the field is empty is shown by the faint
 * rows themselves rather than by a note (convention G-2).
 */
export const DEFAULT_LIMIT_PATTERNS = [
  'usage limit',
  // A limit on one model, not the account: "You've reached your Fable limit. Switch to another
  // model". It never says "usage limit", so it used to read as an ordinary failure - which is the
  // one reading that keeps the queue pointed at the model that cannot answer. Every task in the
  // group ran, died in seconds, and was handed to a human, instead of moving to the fallback
  'reached your .*limit',
  'rate.?limit',
  'too many requests',
  '\\b429\\b',
  'overloaded',
  'quota',
  'insufficient.*credit',
  'capacity'
]
