import type { SessionMessage } from '../../session/types.js'
import { isInjectedUserText, isMachineNotification } from '../injectedText.js'
import { firstDifference } from '../messageDifference.js'
import type { StoreReloadResult } from '../parserUtil.js'
import { collectText, extractUserQuery, firstLine } from '../parserUtil.js'
import type { CursorMessage } from './store.js'
import { readCursorChat } from './store.js'

/**
 * Converts a Cursor CLI chat (store.db) into a message list for the UI.
 *
 * Unlike the other adapters this is **replacement, not append** (cursorStore.ts).
 * Remembering an append position is meaningless, so re-read and return where
 * the difference from last time starts. SessionWatcher re-pastes from there.
 *
 * Utterance blob shapes (observed):
 *   {role:'system',    content: '…'}                     … system prompt (not shown)
 *   {role:'user',      content: '…' | [{type:'text'}]}    … utterance. Preamble is dropped
 *   {role:'assistant', content: [{type:'reasoning'|'text'|'tool-call'}]}
 *   {role:'tool',      content: [{type:'tool-result', toolCallId, result}]}
 */

interface ContentBlock {
  type?: string
  text?: unknown
  toolCallId?: string
  toolName?: string
  args?: unknown
  result?: unknown
  isError?: unknown
}

export class CursorSessionParser {
  messages: SessionMessage[] = []
  title: string | null = null

  /**
   * Re-reads store.db. Returns where changes start (-1 for no change).
   *
   * Also -1 when unreadable. Reads can fail mid-write, and emptying the
   * conversation there makes the screen flash blank, so keep the previous
   * content.
   */
  reload(storePath: string, chatId: string): StoreReloadResult {
    const chat = readCursorChat(storePath, chatId)
    if (!chat) return { changedFromIndex: -1, readSucceeded: false }

    const next: SessionMessage[] = []
    const toolIndex = new Map<string, { m: number; b: number }>()
    let title: string | null = null

    for (const raw of chat.messages) {
      const message = this.convert(raw, next.length, toolIndex)
      if (!message) continue
      if (message.role === 'user' && !title) {
        const text = message.blocks.find((b) => b.kind === 'text')
        if (text?.kind === 'text') title = firstLine(text.text)
      }
      next.push(message)
    }

    // Fold tool results into their corresponding call rows
    for (const raw of chat.messages) {
      if (raw.role !== 'tool') continue
      for (const block of blocksOf(raw.content)) {
        if (block.type !== 'tool-result' || !block.toolCallId) continue
        const loc = toolIndex.get(block.toolCallId)
        if (!loc) continue
        const target = next[loc.m]?.blocks[loc.b]
        if (target?.kind === 'tool') {
          target.tool.result = collectText(block.result)
          target.tool.isError = block.isError === true
        }
      }
    }

    const changed = firstDifference(this.messages, next)
    this.messages = next
    this.title = title ?? chat.name
    return { changedFromIndex: changed, readSucceeded: true }
  }

  private convert(
    raw: CursorMessage,
    index: number,
    toolIndex: Map<string, { m: number; b: number }>
  ): SessionMessage | null {
    if (raw.role === 'system') return null
    // Results fold into the call's row, so no standalone row for them
    if (raw.role === 'tool') return null

    if (raw.role === 'user') {
      const text = collectText(raw.content)
      const body = extractUserQuery(text)
      if (body.length === 0) return null
      /*
       * Environment info and subagent instructions are written with the user
       * role. `<user_query>` marks what the human typed — except around a
       * notification, where Cursor puts its own prompt in that same wrapper.
       * Where there is no wrapper at all, detect by shape.
       */
      if (isMachineNotification(text)) return null
      if (body === text.trim() && isInjectedUserText(text)) return null
      return {
        id: `cursor_${index}`,
        role: 'user',
        isSidechain: false,
        timestamp: null,
        blocks: [{ kind: 'text', text: body }],
        model: null
      }
    }

    if (raw.role !== 'assistant') return null

    const blocks: SessionMessage['blocks'] = []
    for (const block of blocksOf(raw.content)) {
      if (block.type === 'reasoning') {
        const text = collectText(block.text)
        // Thinking blocks arrive with only a signature and an empty body. Nothing to show.
        if (text.trim().length > 0) blocks.push({ kind: 'thinking', text })
      } else if (block.type === 'text') {
        const text = collectText(block.text)
        if (text.trim().length > 0) blocks.push({ kind: 'text', text })
      } else if (block.type === 'tool-call') {
        const id = block.toolCallId ?? `cursor_tool_${index}_${blocks.length}`
        toolIndex.set(id, { m: index, b: blocks.length })
        blocks.push({
          kind: 'tool',
          tool: {
            id,
            name: block.toolName ?? 'tool',
            input: block.args ?? {},
            target: null,
            result: null,
            isError: false,
            images: []
          }
        })
      }
    }

    if (blocks.length === 0) return null
    return {
      id: `cursor_${index}`,
      role: 'assistant',
      isSidechain: false,
      timestamp: null,
      blocks,
      model: null
    }
  }
}

/** content can also be a string. Normalize to an array of blocks. */
function blocksOf(content: unknown): ContentBlock[] {
  if (!Array.isArray(content)) return []
  return content.filter((c): c is ContentBlock => Boolean(c) && typeof c === 'object')
}

/**
 * First position where two message lists differ. -1 when identical.
 *
 * Cursor grows by rewriting the last row (thinking → body → tool), so
 * "just the added part" isn't enough. Look at the content to decide the
 * range to re-paste.
 */
