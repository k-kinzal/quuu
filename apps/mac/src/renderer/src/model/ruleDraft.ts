import type { TaskStatus } from '../../../api/schemas/tasks.js'
import { OPEN_STATUSES } from './taskStatus.js'

/** The creation form's default selection. Validation on save is automation's job. */
export const DEFAULT_BLOCK_STATUSES: TaskStatus[] = [...OPEN_STATUSES]

/**
 * What choosing "continuous" selects. Review is left out so the next task follows as soon as one
 * finishes; failed stays in so a rule that fails on arrival stops after one instead of looping.
 */
export const CONTINUOUS_BLOCK_STATUSES: TaskStatus[] = ['held', 'queued', 'running', 'failed']
