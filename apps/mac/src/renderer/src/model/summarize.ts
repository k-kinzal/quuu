import type { SessionBlock, SessionImage, SessionMessage, SessionRole, ToolCall } from '../../../preload/api/session.js'

/**
 * Turn the session log into a readable shape.
 *
 * The raw timeline laid out as-is takes maximal area yet yields nothing to
 * read. Two things happen here:
 *   1. Fold consecutive same-speaker / same-tool entries (`buildTurns`)
 *   2. Bundle one instruction with its response (`buildSections`).
 *      What readers lose in a long conversation is "which instruction is this
 *      the response to", so the bundle's heading stays in view while scrolling
 */

/**
 * Tool name → kind.
 *
 * **Per-CLI names converge into one vocabulary here.** The same "wrote a file"
 * is `Edit` in Claude, `apply_patch` in Codex, `edit_file` in Cursor.
 * Without aligning here, switching CLIs alone loses the verbs and colors, and
 * the conversation pane becomes a list of tool names (it actually did with Codex).
 */
const WRITE_TOOLS = new Set([
  'Write',
  'Edit',
  'MultiEdit',
  'NotebookEdit',
  'StrReplace',
  // codex / copilot / cursor
  'apply_patch',
  'create_file',
  'edit_file',
  'str_replace_editor',
  'write'
])
const READ_TOOLS = new Set(['Read', 'NotebookRead', 'read_file', 'view_image', 'view'])
const SEARCH_TOOLS = new Set(['Grep', 'Glob', 'LS', 'Search', 'grep', 'glob', 'codebase_search'])
const SHELL_TOOLS = new Set([
  'Bash',
  'BashOutput',
  'Shell',
  // codex: exec_command runs; write_stdin / wait operate on something already running
  'exec_command',
  'exec',
  'shell',
  'shell_command',
  'run_in_terminal',
  'write_stdin',
  'wait'
])
const WEB_TOOLS = new Set(['web_search', 'web_fetch', 'browser_search'])

export type ToolKind = 'write' | 'read' | 'search' | 'shell' | 'agent' | 'web' | 'plan' | 'other'

export function toolKind(name: string): ToolKind {
  if (WRITE_TOOLS.has(name)) return 'write'
  if (READ_TOOLS.has(name)) return 'read'
  if (SEARCH_TOOLS.has(name)) return 'search'
  if (SHELL_TOOLS.has(name)) return 'shell'
  if (name === 'Task' || name === 'Agent') return 'agent'
  if (name === 'TodoWrite' || name === 'update_plan') return 'plan'
  if (WEB_TOOLS.has(name) || name.startsWith('Web')) return 'web'
  return 'other'
}

// ---------------------------------------------------------------------------
// Turns and clusters
// ---------------------------------------------------------------------------

/**
 * Merge consecutive messages from the same speaker into one turn.
 * Eight repeated "Agent 15:13" headings are nothing but non-data ink.
 */
export interface Turn {
  id: string
  role: SessionRole
  isSidechain: boolean
  startedAt: string | null
  endedAt: string | null
  items: TurnItem[]
}

/** Consecutive same tools fold into one row (clustering). */
export type TurnItem =
  | { kind: 'text'; id: string; text: string }
  | { kind: 'thinking'; id: string; text: string }
  | { kind: 'tools'; id: string; name: string; tools: ToolCall[] }
  | { kind: 'images'; id: string; images: SessionImage[] }

export function buildTurns(messages: SessionMessage[]): Turn[] {
  const turns: Turn[] = []

  for (const message of messages) {
    const last = turns[turns.length - 1]
    const sameSpeaker = last && last.role === message.role && last.isSidechain === message.isSidechain

    const turn: Turn = sameSpeaker
      ? last
      : {
        id: message.id,
        role: message.role,
        isSidechain: message.isSidechain,
        startedAt: message.timestamp,
        endedAt: message.timestamp,
        items: []
      }
    if (!sameSpeaker) turns.push(turn)
    if (message.timestamp) turn.endedAt = message.timestamp

    message.blocks.forEach((block, position) => appendBlock(turn, `${message.id}:${position}`, block))
  }

  return turns
}

/**
 * An item is named after the block that opened it (the message id and the block's
 * position in that message), never after its position in the turn. The conversation
 * pane finds the reader's item again once a page has arrived, and a page loaded in
 * front of the window lengthens the window's first turn: numbering by turn position
 * renamed every item in that turn, so the place was lost and the scroll jumped
 * (it did, on any run whose response is longer than a page).
 */
function appendBlock(turn: Turn, id: string, block: SessionBlock): void {
  const last = turn.items[turn.items.length - 1]

  if (block.kind === 'text') {
    // Consecutive text joins into one paragraph sequence (avoids duplicate headings)
    if (last && last.kind === 'text') {
      last.text = `${last.text}\n\n${block.text}`
      return
    }
    turn.items.push({ kind: 'text', id, text: block.text })
    return
  }

  if (block.kind === 'thinking') {
    if (last && last.kind === 'thinking') {
      last.text = `${last.text}\n\n${block.text}`
      return
    }
    turn.items.push({ kind: 'thinking', id, text: block.text })
    return
  }

  if (block.kind === 'image') {
    // Images pasted in a row become one strip. A block per image buries the conversation in pictures
    if (last && last.kind === 'images') {
      last.images.push(block.image)
      return
    }
    turn.items.push({ kind: 'images', id, images: [block.image] })
    return
  }

  if (last && last.kind === 'tools' && last.name === block.tool.name) {
    last.tools.push(block.tool)
    return
  }
  turn.items.push({ kind: 'tools', id, name: block.tool.name, tools: [block.tool] })
}

// ---------------------------------------------------------------------------
// Sections (one instruction = one section)
// ---------------------------------------------------------------------------

/**
 * One instruction plus the responses to it.
 *
 * As a conversation grows, **which instruction the thing you are reading responds to**
 * stops being clear. Put the instruction's one line at the head of the section and keep it
 * there while scrolling (`PromptSection`).
 */
export interface ChatSection {
  id: string
  /** The instruction that becomes the heading. Null only for what precedes the first instruction (an imported log, say) */
  head: Turn | null
  /** The one line shown in the heading. Truncation is done by the view, by width */
  headline: string
  /** What follows the instruction (responses, subagents, logs) */
  rest: Turn[]
}

export function buildSections(turns: Turn[]): ChatSection[] {
  const sections: ChatSection[] = []

  for (const turn of turns) {
    /*
     * Only **an instruction we issued** starts a new section.
     * Instructions to a subagent also carry role user, but they are part of the response,
     * so breaking on them splits one request across sections and the headings stop meaning anything
     */
    const starts = turn.role === 'user' && !turn.isSidechain
    const last = sections[sections.length - 1]

    if (starts || !last) {
      sections.push({
        id: turn.id,
        head: starts ? turn : null,
        headline: starts ? promptHeadline(turnText(turn)) : '',
        rest: starts ? [] : [turn]
      })
      continue
    }
    last.rest.push(turn)
  }

  return sections
}

/** Join a turn's body (the text parts only) into one string. */
export function turnText(turn: Turn): string {
  return turn.items
    .filter((item): item is Extract<TurnItem, { kind: 'text' }> => item.kind === 'text')
    .map((item) => item.text)
    .join('\n\n')
}

/**
 * Fold an instruction down to one line.
 *
 * Tags the agent's runtime injects (`<system-reminder>` and friends) aren't part of what
 * a human wrote, so they are dropped. Keeping them fills the heading with machine words.
 */
const MACHINE_TAG =
  /<(system-reminder|command-name|command-message|command-args|local-command-stdout|local-command-stderr)>[\s\S]*?<\/\1>/g

export function promptHeadline(text: string): string {
  const cleaned = text.replace(MACHINE_TAG, ' ').trim()
  /*
   * Use the first paragraph only. The point of an instruction is in its opening, and
   * joining what follows (bullet lists, pasted logs, fenced code) pushes that point out
   * of the span that fits on one line
   */
  const paragraph = cleaned.split(/\n\s*\n/, 1)[0] ?? ''
  return paragraph.replace(/\s+/g, ' ').trim()
}
