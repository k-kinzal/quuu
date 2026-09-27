import { randomBytes, timingSafeEqual } from 'node:crypto'
import { chmodSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** MCP clients can retain their configuration across routine app restarts. */
export function serverToken(directory: string): string {
  const file = join(directory, 'server-token')
  try { writeFileSync(file, randomBytes(32).toString('hex') + '\n', { flag: 'wx', mode: 0o600 }) }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
  const token = readFileSync(file, 'utf8').trim()
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Invalid Quuu server credential file')
  chmodSync(file, 0o600)
  return token
}

export function authorized(actual: string | undefined | null, token: string): boolean {
  const a = Buffer.from(actual ?? ''), b = Buffer.from(`Bearer ${token}`)
  return a.length === b.length && timingSafeEqual(a, b)
}
