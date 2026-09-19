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
  return instructionsSince(messages, run.startedAt)
}

/**
 * The instructions the session recorded from this moment on, in the order they were written.
 *
 * A subagent's prompt also arrives under the user role, but it is part of an answer, not something
 * handed to this conversation.
 */
export function instructionsSince(messages: SessionMessage[], startedAt: string): string[] {
  const started = Date.parse(startedAt)
  if (Number.isNaN(started)) return []
  // Some logs keep only whole seconds, so what was written in the starting second still counts
  const from = Math.floor(started / 1000) * 1000
  const said: string[] = []
  for (const message of messages) {
    if (message.role !== 'user' || message.isSidechain) continue
    if (message.timestamp === null || Date.parse(message.timestamp) < from) continue
    const text = messageText(message)
    if (text.length > 0) said.push(text)
  }
  return said
}

function messageText(message: SessionMessage): string {
  return message.blocks
    .map((block) => (block.kind === 'text' ? block.text : ''))
    .filter((text) => text.length > 0)
    .join('\n\n')
    .trim()
}
