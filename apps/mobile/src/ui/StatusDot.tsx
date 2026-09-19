import { StatusIndicator, useTheme, type StatusShape } from '@design-system/react'
import { TASK_STATUS_LABEL } from '../model/labels.js'
import type { RunStatus, TaskStatus } from '../sync/task.js'

/**
 * The status sign (color + shape + word).
 *
 * The design system holds only **how shapes and colors are drawn**; which status gets
 * which shape is decided here. Display judgments belong to the View.
 *
 * The shape changes per status, so that rows can be scanned down a column regardless
 * of color vision.
 */
const SHAPE: Record<TaskStatus, StatusShape> = {
  draft: 'ring',
  // The "held" shape. Not to be confused with Queued's quarter circle
  held: 'pause',
  queued: 'quarter',
  running: 'spinner',
  review: 'diamond',
  failed: 'cross',
  done: 'check'
}

export function StatusDot({ status }: { status: TaskStatus }): JSX.Element {
  const theme = useTheme()
  return (
    <StatusIndicator
      shape={SHAPE[status]}
      color={theme.palette.quuu.status[status]}
      label={TASK_STATUS_LABEL[status]}
    />
  )
}

/** Run outcome -> color. The words belong to `RUN_STATUS_LABEL`. */
export function runStatusColor(theme: ReturnType<typeof useTheme>, status: RunStatus): string {
  const s = theme.palette.quuu.status
  switch (status) {
    case 'succeeded':
      return s.done
    case 'limited':
      return s.review
    case 'failed':
    case 'timeout':
      return s.failed
    case 'running':
    case 'starting':
      return s.running
    default:
      return theme.palette.text.tertiary
  }
}
