import { randomUUID } from 'node:crypto'

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 20)}`
}

/** Claude Code's --session-id must be a plain UUID. */
export function newSessionId(): string {
  return randomUUID()
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function isoPlusSeconds(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString()
}

/** SQLite doesn't accept booleans, so lower to 0/1. */
export function b2i(v: boolean): number {
  return v ? 1 : 0
}

export function i2b(v: unknown): boolean {
  return v === 1 || v === true || v === '1'
}

export function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || raw.length === 0) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/** Truncate paths and titles (the UI uses this too, but main needs it for notification copy). */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}
