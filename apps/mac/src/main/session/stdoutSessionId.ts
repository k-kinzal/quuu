import { closeSync, openSync, readSync } from 'node:fs'
import type { LogAdapter } from '../agents/cliAdapter.js'

/**
 * Pick the session ID the CLI announced out of the stdout log Quuu wrote itself.
 *
 * On a CLI that cannot take the ID Quuu minted (Codex), **the recorded ID is an ID that exists
 * nowhere**. Whether the log is read as a structured log or as stdout, the way in to the real ID
 * is the stdout Quuu saved.
 * Left as a lie, a follow-up's resume points at a session that does not exist, and import enqueues
 * a session we launched a second time as an external one (see `sessionIdentity.ts`).
 *
 * The CLI announces it at launch. Codex prints one line in its first header (measured):
 *
 *     OpenAI Codex v0.149.0
 *     --------
 *     workdir: /Users/me/Projects/demo-app
 *     ...
 *     session id: 01a03143-aa86-7442-9bfd-e362b34f4947
 *     --------
 *     user
 *
 * Search only inside a **closed** header. That avoids picking one up while only one rule has been
 * printed (still starting up), or when the prompt body happens to contain the same text
 * (pasting this very paragraph into an instruction claiming another session can really happen).
 *
 * Both the Codex banner and a closed header are required. An ID that appears in the body is not used.
 *
 * The Antigravity CLI (`agy`) announces its own, in a different shape: run with
 * `--output-format stream-json` its **first line** is an `init` event carrying the conversation it
 * opened (measured):
 *
 *     {"event":"init","conversation_id":"6d7e0c6e-…","init":{"cwd":"/Users/me/Projects/demo",…}}
 *
 * That is anchored to the start of a line, so a body that quotes the same text cannot pass for it.
 */

/** Skip the long # cmd line and read only the closed header the CLI itself printed. */
const CHUNK_BYTES = 8 * 1024
const MAX_STARTUP_BYTES = 2 * 1024 * 1024
const RULE = /^-{3,}$/
const SESSION_ID = /^session[ _-]?id:\s*([0-9a-fA-F][0-9a-fA-F-]{30,})$/

const AGY_INIT = /^\{"event":"init","conversation_id":"([0-9a-fA-F-]{36})"/m
/**
 * How much of an unfinished line to carry into the next chunk.
 *
 * A match has to start at the line's first character, so once that much of a line has gone by
 * without one, the rest of it cannot match either. That keeps the `# cmd` line Quuu writes first -
 * which carries the whole prompt and can run to megabytes - from being held in memory.
 */
const AGY_LINE_HEAD = 1024

export function sessionIdInStdout(logPath: string, adapter: LogAdapter = 'stdout'): string | null {
  return adapter === 'agy' ? agyConversationId(logPath) : codexSessionId(logPath)
}

/** The conversation the Antigravity CLI opened, off its `init` line. */
function agyConversationId(logPath: string): string | null {
  let fd: number
  try { fd = openSync(logPath, 'r') } catch { return null }
  try {
    const buffer = Buffer.allocUnsafe(CHUNK_BYTES)
    let carry = ''
    for (let offset = 0; offset < MAX_STARTUP_BYTES;) {
      const count = readSync(fd, buffer, 0, buffer.length, offset)
      if (!count) break
      offset += count
      const text = carry + buffer.subarray(0, count).toString('utf8')
      const match = AGY_INIT.exec(text)
      if (match) return match[1]
      const newline = text.lastIndexOf('\n')
      carry = (newline < 0 ? text : text.slice(newline + 1)).slice(0, AGY_LINE_HEAD)
    }
    return null
  } catch {
    return null
  } finally { closeSync(fd) }
}

function codexSessionId(logPath: string): string | null {
  let fd: number
  try { fd = openSync(logPath, 'r') } catch { return null }
  try {
    const buffer = Buffer.allocUnsafe(CHUNK_BYTES)
    let line = ''
    let oversized = false
    let banner = false
    let opened = false
    let found: string | null = null
    for (let offset = 0; offset < MAX_STARTUP_BYTES;) {
      const count = readSync(fd, buffer, 0, buffer.length, offset)
      if (!count) break
      offset += count
      // The header we look for is ASCII. UTF-8 from the prompt straddling a chunk boundary is never used to identify it.
      for (const byte of buffer.subarray(0, count)) {
        if (byte !== 10) {
          if (line.length < 4096) line += String.fromCharCode(byte)
          else oversized = true
          continue
        }
        const value = oversized ? '' : line.trim()
        line = ''
        oversized = false
        if (!banner) {
          if (/^OpenAI Codex v\S+$/.test(value)) banner = true
          continue
        }
        if (RULE.test(value)) {
          if (opened) return found
          opened = true
        } else if (opened) {
          const match = SESSION_ID.exec(value)
          if (match) found = match[1]
        }
      }
    }
    return null
  } catch {
    return null
  } finally { closeSync(fd) }
}
