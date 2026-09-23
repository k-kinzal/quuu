import { closeSync, openSync, readSync } from 'node:fs'
const CHUNK_BYTES = 8 * 1024

const MAX_STARTUP_BYTES = 2 * 1024 * 1024

const RULE = /^-{3,}$/

const SESSION_ID = /^session[ _-]?id:\s*([0-9a-fA-F][0-9a-fA-F-]{30,})$/

export function codexSessionId(logPath: string): string | null {
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
