/**
 * Input rules for the composer (rule D-②).
 *
 * The same composer appears at the bottom of the list and at the bottom of the
 * conversation. If identically shaped inputs had different commit keys you'd get
 * "looks the same, behaves differently", which no mental model can explain.
 * The rules live here once and both sides use them.
 */

/**
 * Take only the structure a key check needs.
 * React's KeyboardEvent can be passed straight in, and since it doesn't depend on the DOM it's testable.
 */
export interface KeyLike {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  nativeEvent: { isComposing: boolean; keyCode: number }
}

/**
 * Is the IME mid-conversion?
 *
 * In Japanese input, committing a conversion also arrives as an Enter keydown. Catch it
 * without distinguishing and a send or a confirm fires from "I only committed the conversion".
 * Any text input that catches Enter / Escape must go through here.
 *
 * The legacy keyCode 229 is checked too, for environments that never raise `isComposing`.
 */
export function isImeComposing(e: KeyLike): boolean {
  return e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229
}

/**
 * The composer's commit key. Exactly one: `⌘↵` / `Ctrl+↵`.
 *
 * Enter alone is always a newline. It can't be told apart from an IME conversion commit,
 * so binding it to send guarantees a misfire in Japanese input.
 * No conditional either, like "Enter sends on one line, newlines on many".
 * A commit key whose meaning changes mid-typing is the same broken consistency.
 */
export function isSubmitKey(e: KeyLike): boolean {
  return e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !isImeComposing(e)
}

export interface DraftParts {
  /** Line 1. The name that identifies it in the list. */
  title: string
  /** Line 2 onward. The instructions handed to the agent. Empty means no instructions. */
  prompt: string
}

/**
 * Split what was written in the list composer into a title and instructions.
 *
 * A summary can't be derived from the text afterwards, so the writer names it
 * on the first line. Anything from line 2 on becomes the instructions; with nothing
 * there, prompt is empty. Queued vs. draft is decided explicitly by the caller.
 *
 * Leading blank lines are skipped, so that "line 1 = the title" doesn't come up
 * empty when pasted text starts with a blank line.
 */
export function splitDraft(text: string): DraftParts {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  let head = 0
  while (head < lines.length && lines[head].trim().length === 0) head += 1
  return {
    title: (lines[head] ?? '').trim(),
    prompt: lines
      .slice(head + 1)
      .join('\n')
      .trim()
  }
}

export interface DraftLead {
  /** Line 1. Once divided, shown on its own line as the settled title */
  title: string
  /** Line 2 onward. Empty while not divided */
  body: string
  /** Whether line 2 has been reached. The cue to split the input in two */
  divided: boolean
}

/**
 * Split a work-in-progress draft into the shape shown on screen right now.
 *
 * `splitDraft` extracts the values at queue time (it trims the edges). This one is for
 * **display while typing** and returns the characters as typed.
 * If whitespace disappeared mid-keystroke, the caret would look like it jumped.
 *
 * Divide the moment line 2 is reached. Instead of explaining "line 1 becomes the title"
 * in prose, move line 1 onto its own line to show it is settled (rule D-②).
 * Leading blank lines are skipped just like in `splitDraft` — so the visible first line
 * and the line that actually becomes the title don't drift apart.
 */
export function divideDraft(text: string): DraftLead {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  let head = 0
  while (head < lines.length && lines[head].trim().length === 0) head += 1
  if (head >= lines.length - 1) return { title: text, body: '', divided: false }
  return { title: lines[head], body: lines.slice(head + 1).join('\n'), divided: true }
}

/** Rejoin a divided state back into a draft. The inverse of `divideDraft`. */
export function joinDraft(title: string, body: string): string {
  return `${title}\n${body}`
}
