import { StatusIndicator, useTheme, type StatusShape } from '@design-system/react'
import type { RunStatus, TaskStatus } from '../../../preload/api/tasks.js'
import { TASK_STATUS_LABEL } from '../model/labels.js'

/**
 * The status sign (color + shape + word).
 *
 * The design system owns only **how shapes and colors are drawn**; "which status gets which
 * shape" is decided here. Display decisions belong to the View.
 *
 * The shape changes per status, so a column of rows can be scanned and picked out regardless
 * of color vision.
 */
const SHAPE: Record<TaskStatus, StatusShape> = {
  draft: 'ring',
  // The "held" shape. Never confusable with the queued quarter-circle
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

/** Run outcome → color. The words are held by `RUN_STATUS_LABEL`. */
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
