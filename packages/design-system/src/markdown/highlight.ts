import {
  createHighlighter,
  createJavaScriptRegexEngine,
  type BundledLanguage,
  type Highlighter,
  type ThemedToken
} from 'shiki'
import type { ColorScheme } from '../theme/tokens.js'
import { shikiTheme } from './shikiTheme.js'

/**
 * Cut code into words.
 *
 * The grammar is left to shiki (the same TextMate grammars as VS Code) and only the
 * colors come from our own tokens (`shikiTheme`).
 *
 * **Use the JavaScript regex engine.** shiki defaults to oniguruma (WebAssembly), but
 * this screen's CSP is `script-src 'self'` and cannot compile WASM (that needs
 * `wasm-unsafe-eval`). This is a surface that renders strings other people wrote, so
 * **swap the grammar engine rather than loosen the CSP**. The tests run on the same
 * engine, so the screen and the check never diverge.
 *
 * Grammars are **loaded when they are needed** (dynamic import). A task whose
 * conversation contains no code loads none of them.
 */

/** The ceiling for highlighting. Anything past this is a misplaced paste or a raw log, so emit it plain */
const MAX_LENGTH = 200_000

/**
 * The conditions under which the grammar is applied. **Do not leave them at the defaults.**
 *
 * shiki (vscode-textmate) defaults to **giving up after 500ms per line**, and an
 * abandoned line comes back as a coarse, uncolored blob. On a busy machine you hit
 * this, and **the same code comes out in different colors on every run** (found by a
 * test failing nondeterministically; the same thing was happening on screen).
 *
 * Stop on **line length**, not on time. An over-long line is a minified blob or a raw
 * log, and coloring it does not make it readable. Stopping on length makes the result
 * always the same.
 */
export const TOKENIZE = {
  tokenizeTimeLimit: 10_000,
  tokenizeMaxLineLength: 8_000
} as const

let highlighter: Promise<Highlighter> | null = null

function get(): Promise<Highlighter> {
  highlighter ??= createHighlighter({
    themes: [shikiTheme('dark'), shikiTheme('light')],
    // Grammars are added later (carrying them from the start weighs down even conversations with no diagram and no code)
    langs: [],
    engine: createJavaScriptRegexEngine({ forgiving: true })
  })
  return highlighter
}

/**
 * Put grammar loading and highlighting **into one queue and run them in order.**
 *
 * A single highlighter is reused (so grammars are not loaded over and over).
 * `loadLanguage` rewrites the grammar table inside it, so calling it while another
 * highlight is running returns **a result cut with a half-rewritten table**. It breaks
 * as a single word losing its color, and the result depends on what happened to be
 * running at the same time (a test really was failing nondeterministically).
 *
 * The cutting itself is synchronous and fast. The only wait is the first load of a
 * grammar, so serializing changes nothing about how the screen feels.
 */
let queue: Promise<unknown> = Promise.resolve()

function serialize<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(work, work)
  // Do not carry a previous failure forward (one unreadable grammar must not stall the queue)
  queue = next.then(
    () => undefined,
    () => undefined
  )
  return next
}

export async function highlightCode(
  code: string,
  language: string,
  scheme: ColorScheme
): Promise<ThemedToken[][] | null> {
  if (code.length > MAX_LENGTH) return null
  try {
    const shiki = await get()
    return await serialize(async () => {
      // Several fences in the same language still load it once (the check happens inside the queue)
      if (!shiki.getLoadedLanguages().includes(language)) {
        await shiki.loadLanguage(language as BundledLanguage)
      }
      return shiki.codeToTokens(code, {
        lang: language as BundledLanguage,
        theme: `ds-${scheme}`,
        includeExplanation: false,
        ...TOKENIZE
      }).tokens
    })
  } catch {
    // Show the body even if the grammar cannot be loaded. The only loss is the color
    return null
  }
}
