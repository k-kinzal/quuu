import type { Db } from '../db/database.js'
import * as repo from '../db/repo.js'
import type { Run } from '../execution/types.js'
import { sessionKey } from './index.js'
import { sessionReadTarget } from './sessionAttach.js'
import { snapshotStamp } from './sessionWatcher.js'
import type { SessionMessage } from './types.js'

/**
 * What a run has already put into the agent's conversation.
 *
 * A CLI writes the instruction into its session the moment it accepts a resume — before there is
 * any answer to write next to it. So a run that died against a usage limit still left the whole
 * instruction sitting in the conversation, unanswered. Send the same text again on the retry and
 * the session gains a second copy of it: once in what the reader sees, and once in what the model
 * reads on the next turn. One real session collected five copies of a single instruction that way,
 * one per retry, and the task could no longer be read at all.
 */

/** How far back to read. What one run said sits at the end of what it wrote. */
const TAIL = 40

/**
 * The instructions this run handed over, oldest first. Empty when the session cannot vouch for it.
 *
 * Only the durable index is consulted, and only while it matches the file on disk. An index that
 * has not caught up proves nothing, and the caller must fall back to sending the instruction —
 * a duplicate copy is repairable, an instruction nobody ever received is not.
 */
export function deliveredInstructions(db: Db, run: Run): string[] {
  const target = sessionReadTarget(db, run)
  const key = sessionKey(target)
  const saved = repo.getSessionIndex(db, key)
  if (!saved || saved.stamp !== snapshotStamp(target.logPath)) return []
  const start = Math.max(0, saved.total - TAIL)
  const messages = repo.readSessionMessages(db, key, saved.generation, start, saved.total - start)
  return instructionsSince(messages, run)
}

/**
 * The instructions the session recorded from this run on, in the order they were written.
 *
 * A subagent's prompt also arrives under the user role, but it is part of an answer, not something
 * handed to this conversation.
 */
export function instructionsSince(
  messages: SessionMessage[],
  run: Pick<Run, 'startedAt' | 'promptPreview'>
): string[] {
  const said: string[] = []
  for (const message of writtenBy(messages, run)) {
    if (message.role !== 'user' || message.isSidechain) continue
    const text = messageText(message)
    if (text.length > 0) said.push(text)
  }
  return said
}

/**
 * The stretch of a conversation one run wrote.
 *
 * The clock answers this wherever a CLI records one. Cursor and Grok record none - every message
 * they keep comes back with a null timestamp - so a cut by time hands back nothing and the run
 * reads as if it had written not a word. What followed was the very thing this file exists to
 * prevent: a Cursor task was handed the same sentence on all three of its attempts.
 *
 * Without a clock the instruction itself is the marker. A CLI writes what it was resumed with as
 * a user turn the moment it accepts the resume, so the conversation from that copy on is what
 * this run put there. An older turn of the same wording can be picked instead when this run never
 * got as far as writing its own; what the agent is then asked is to carry on the sentence above,
 * which says the same thing in the same words.
 *
 * The View reads it the same way off the conversation on screen (`renderer/src/model/derive.ts`).
 */
export function writtenBy(
  messages: SessionMessage[],
  run: Pick<Run, 'startedAt' | 'promptPreview'>
): SessionMessage[] {
  if (messages.some((message) => message.timestamp !== null)) {
    const started = Date.parse(run.startedAt)
    if (Number.isNaN(started)) return []
    // Some logs keep only whole seconds, so what was written in the starting second still counts
    const from = Math.floor(started / 1000) * 1000
    return messages.filter(
      (message) => message.timestamp !== null && Date.parse(message.timestamp) >= from
    )
  }
  const handed = run.promptPreview.trim()
  if (handed.length === 0) return []
  const anchor = messages.findLastIndex(
    (message) =>
      message.role === 'user' && !message.isSidechain && messageText(message).includes(handed)
  )
  return anchor === -1 ? [] : messages.slice(anchor)
}

function messageText(message: SessionMessage): string {
  return message.blocks
    .map((block) => (block.kind === 'text' ? block.text : ''))
    .filter((text) => text.length > 0)
    .join('\n\n')
    .trim()
}
