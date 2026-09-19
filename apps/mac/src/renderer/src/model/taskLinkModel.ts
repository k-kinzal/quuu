import type { DependsMode } from '../../../preload/api/tasks.js'
import { t } from './i18n/index.js'

/**
 * A link (a prerequisite) attached to a task about to be queued, **before it is queued**.
 *
 * Until now the only way to add a dependency was "create it, open it, name it in the
 * inspector". But the order is usually **decided before you write anything** ("once this
 * is done, next is that"). The queueing surface holds this so the round trip from
 * creating to linking disappears.
 *
 * There are two sides the new task can land on, and both are genuinely needed:
 *
 *   after  … the new task goes **after** the other one. It runs once that one is finished
 *   before … the new task goes **before** the other one. That one now waits on this
 *
 * `mode` is the waiting condition (`DependsMode`). In either direction it names "what the
 * waiting side waits for on the waited-for side", so the meaning stays single.
 */
export type LinkDirection = 'after' | 'before'

export interface NewTaskLink {
  /** The other end of the link. An existing task. */
  taskId: string
  direction: LinkDirection
  mode: DependsMode
}

/**
 * The words for the direction. Written as **what the new task becomes**.
 * Written as "what happens to the other one", it only reads when the right-clicked row is
 * the subject, and stops reading on the chip in the queueing surface.
 */
export const LINK_DIRECTION_LABEL: Record<LinkDirection, string> = {
  after: t('taskLink.direction.after'),
  before: t('taskLink.direction.before')
}

/**
 * The word for which side, **appended after** the other task's name.
 *
 * Joined into one string with the name, a long name truncates at the end and the
 * "after" in "after ◯◯" disappears, leaving a chip that is just a title (that actually
 * happened). It rides on a mark that never shrinks (`Badge`), so it is held apart from
 * the name.
 */
export const LINK_SUFFIX_LABEL: Record<LinkDirection, string> = {
  after: t('taskLink.suffix.after'),
  before: t('taskLink.suffix.before')
}

