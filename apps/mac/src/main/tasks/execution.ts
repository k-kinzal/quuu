import type { Db } from '../db/database.js'
import * as repo from '../db/repo.js'
import type { TaskStatus } from './status.js'
import type { Task } from './types.js'

/** Observing execution never grants completion. Transitions from existing run results land here. */
export function recordExecutionState(
  db: Db, id: string, status: Exclude<TaskStatus, 'done'>,
  patch: Parameters<typeof repo.setTaskStatus>[3] = {}
): Task {
  return repo.setTaskStatus(db, id, status, patch)
}

export function consumeReservation(db: Db, id: string): void {
  repo.setReservedMessage(db, id, '')
}
