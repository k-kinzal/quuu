import { SYNC_INTENT_VERSION, SYNC_VERSION } from './protocol.js'
import type { RunStatus } from './task.js'


/**
 * Reading. **Never trust what arrives.**
 *
 * What is read was written by another device running another version of the app, and
 * iCloud sometimes shows it half-downloaded. If one corrupt entry stops the app, there
 * is no way to go fix it from here (you are in the bath, in bed, or on a train).
 * So anything unreadable is **discarded rather than thrown**. The discard is reported
 * back to the caller.
 */

export type ParseResult<T> = { ok: true; value: T } | { ok: false; reason: string }


export function fail<T>(reason: string): ParseResult<T> {
  return { ok: false, reason }
}


export function asRecord(text: string): ParseResult<Record<string, unknown>> {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    // A half-downloaded iCloud file lands here. Re-reading on the next pass is enough
    return fail('not readable as JSON (it may not have arrived yet)')
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return fail('not an object')
  }
  return { ok: true, value: parsed as Record<string, unknown> }
}


export function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

export function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

export function bool(v: unknown, fallback = false): boolean {
  return typeof v === 'boolean' ? v : fallback
}

export function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}


/**
 * Version check.
 *
 * **Never read a version newer than our own.** Interpreting values carrying meanings we
 * do not know under old rules quietly does the wrong thing (being unable to read is
 * better).
 */
export function versionOk(v: unknown): boolean {
  const n = num(v, -1)
  return Number.isInteger(n) && n >= 1 && n <= SYNC_VERSION
}


/** Intents advance their version independently, so an old Mac never reads a new operation as something else. */
export function intentVersionOk(v: unknown): boolean {
  const n = num(v, -1)
  return Number.isInteger(n) && n >= 1 && n <= SYNC_INTENT_VERSION
}


export function isRunStatus(value: unknown): value is RunStatus { return ['starting', 'running', 'succeeded', 'failed', 'limited', 'canceled', 'timeout'].includes(String(value)) }