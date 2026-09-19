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
  'rate.?limit',
  'too many requests',
  '\\b429\\b',
  'overloaded',
  'quota',
  'insufficient.*credit',
  'capacity'
]
