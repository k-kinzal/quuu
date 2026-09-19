import type { SyncIntent, SyncTask } from './protocol.js'
import { SYNC_INTENT_VERSION } from './protocol.js'
import type { TaskStatus } from './task.js'


/** The shared part of building an intent. The device assigns `seq` monotonically. */
export function makeIntent(args: {
  id: string
  device: string
  seq: number
  createdAt: string
  baseRev: number
  op: SyncIntent['op']
  expect: SyncIntent['expect']
}): SyncIntent {
  return { version: SYNC_INTENT_VERSION, ...args }
}


/** Builds `expect` from one row of the snapshot. */
export function expectOf(task: Pick<SyncTask, 'status' | 'updatedAt' | 'runSeq'>): {
  status: TaskStatus
  updatedAt: string
  runSeq: number
} {
  return { status: task.status, updatedAt: task.updatedAt, runSeq: task.runSeq }
}