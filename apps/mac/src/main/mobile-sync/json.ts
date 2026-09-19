import type { AddAction, Priority, TaskStatus } from './protocol.js'
import { SYNC_INTENT_VERSION, SYNC_VERSION } from './protocol.js'


/**
 * Reading. **Never trust what arrives.**
 *
 * What we read is a file another device wrote with another version of the app, and iCloud may have
 * brought only part of it down. If one broken file stops the app, there is no way to go fix it
 * from where you are (in the bath, in bed, or on a train).
 * So anything unreadable is **dropped rather than thrown**, and the drop is reported to the caller.
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
    // A file iCloud only partly brought down lands here. Re-reading on the next round is enough
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
 * **Never read a version newer than ours.** Interpreting values with meanings we do not know under
 * the old rules does the wrong thing quietly (failing to read is better).
 */
export function versionOk(v: unknown): boolean {
  const n = num(v, -1)
  return Number.isInteger(n) && n >= 1 && n <= SYNC_VERSION
}


/** Intents version independently, so an old Mac does not read a new operation as something else. */
export function intentVersionOk(v: unknown): boolean {
  const n = num(v, -1)
  return Number.isInteger(n) && n >= 1 && n <= SYNC_INTENT_VERSION
}


export function isTaskStatus(value: unknown): value is TaskStatus { return typeof value === 'string' && ['draft', 'held', 'queued', 'running', 'review', 'failed', 'done'].includes(value) }
export function isPriority(value: unknown): value is Priority { return value === 0 || value === 1 || value === 2 || value === 3 }
export function isAddAction(value: unknown): value is AddAction { return typeof value === 'string' && ['draft', 'held', 'queued', 'now'].includes(value) }
