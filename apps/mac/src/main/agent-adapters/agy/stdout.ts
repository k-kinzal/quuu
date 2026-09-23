import { closeSync, openSync, readSync } from 'node:fs'
const CHUNK_BYTES = 8 * 1024

const MAX_STARTUP_BYTES = 2 * 1024 * 1024

const AGY_INIT = /^\{"event":"init","conversation_id":"([0-9a-fA-F-]{36})"/m

const AGY_LINE_HEAD = 1024

export function agyConversationId(logPath: string): string | null {
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
