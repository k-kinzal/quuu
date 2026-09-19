import type { TaskStatus } from '../../../preload/api/tasks.js'
import { OPEN_STATUSES } from './taskStatus.js'

/** The creation form's default selection. Validation on save is automation's job. */
export const DEFAULT_BLOCK_STATUSES: TaskStatus[] = [...OPEN_STATUSES]
