import { bundledLanguages } from 'shiki'

/**
 * The language name written on a fence → a shiki grammar.
 *
 * shiki already keys its aliases (`ts`, `bash`, `yml`, …) directly, so what lives here
 * is only **the spellings shiki does not know**. Grow the table and it stops keeping up
 * with languages shiki adds.
 */
const EXTRA_ALIASES: Record<string, string> = {
  terminal: 'shellsession',
  'sh-session': 'shellsession',
  shellsession: 'shellsession',
  zshrc: 'shellscript',
  bashrc: 'shellscript',
  dockerfile: 'docker',
  jsonl: 'json',
  ndjson: 'json',
  mmd: 'mermaid',
  conf: 'ini',
  env: 'dotenv',
  gitignore: 'ini'
}

/** Spellings that mean "do not highlight". Written or not, emit it plain */
const PLAIN = new Set(['', 'text', 'plaintext', 'plain', 'txt', 'none', 'raw', 'log', 'output'])

/**
 * Returns the grammar to highlight with. An unknown language gives `null` (emit plain).
 *
 * Do not force an unknown language onto a nearby grammar. **Wrong highlighting causes
 * more misreading than no color at all.**
 */
export function resolveLanguage(language: string): string | null {
  const key = language.trim().toLowerCase()
  if (PLAIN.has(key)) return null
  const mapped = EXTRA_ALIASES[key] ?? key
  return mapped in bundledLanguages ? mapped : null
}

/** Is this a fence to be drawn as a diagram? */
export function isDiagramLanguage(language: string): boolean {
  const key = language.trim().toLowerCase()
  return key === 'mermaid' || key === 'mmd'
}
