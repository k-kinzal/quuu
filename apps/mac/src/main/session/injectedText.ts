/**
 * Deciding which text written under the user role was not written by a human.
 *
 * CLIs write context (the environment, where skills live, descriptions of images they read,
 * AGENTS.md) into the log as user-role lines. Listing those as-is puts **things the human never
 * said on screen as their words**. The conversation surface is where you read what was asked and
 * what was done, so muddying it makes it unreadable.
 *
 * Nothing is lost by removing it: environment information shows in the tool lines and run history,
 * and images are displayed separately as blocks.
 */

/** The project instructions Codex injects first. */
const AGENTS_BLOCK =
  /^#[ \t]*AGENTS\.md instructions for [^\r\n]*(?:\r?\n)+<INSTRUCTIONS>[\s\S]*?<\/INSTRUCTIONS>/

/**
 * A multi-line block wrapped in a tag.
 *
 * Injections like `<environment_context>`, `<recommended_plugins>` and `<task-notification>` all
 * take this shape. Keeping a list of tag names would fall behind CLI updates, so it matches on
 * shape instead. A single-line `<div>x</div>` is kept as something a human wrote.
 */
const WRAPPED_BLOCK = /^<([a-z][a-z0-9_-]*)>[\s\S]*?<\/\1>/

export function isInjectedUserText(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length === 0) return true
  return trimmed.includes('\n') && isOnlyInjectedBlocks(trimmed)
}

/**
 * Is the whole thing made only of machine-injected blocks?
 *
 * An injection does not necessarily arrive as one tag. Cursor writes environment info, rules and
 * the skill list **concatenated into a single utterance** (measured: a 20,000-character user
 * message starting with `<user_info>` and ending with `</agent_skills>`).
 * Codex goes further and splices `# AGENTS.md ...` in between the tagged blocks.
 * Looking only for "the whole thing is one tag" puts this on screen as a human's words.
 *
 * Blocks are eaten from the front, and if it all gets eaten it counts as injected.
 * One sentence outside a tag is enough to keep it as something a human wrote.
 */
function isOnlyInjectedBlocks(text: string): boolean {
  let rest = text
  let ate = false

  while (rest.length > 0) {
    const hit = WRAPPED_BLOCK.exec(rest) ?? AGENTS_BLOCK.exec(rest)
    if (!hit) return false
    rest = rest.slice(hit[0].length).trim()
    ate = true
  }
  return ate
}
