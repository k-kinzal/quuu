import type { AddAction } from '../sync/addAction.js'
import type { DependsMode, Priority, RunStatus, TaskStatus } from '../sync/task.js'
import { t } from './i18n/index.js'

/** The iPhone's View converts state into display copy. */
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  draft: t('taskStatus.draft'),
  held: t('taskStatus.held'),
  queued: t('taskStatus.queued'),
  running: t('taskStatus.running'),
  review: t('taskStatus.review'),
  failed: t('taskStatus.failed'),
  done: t('taskStatus.done')
}

export const PRIORITY_LABEL: Record<Priority, string> = {
  0: 'P0',
  1: 'P1',
  2: 'P2',
  3: 'P3'
}

export const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  starting: t('runStatus.starting'),
  running: t('runStatus.running'),
  succeeded: t('runStatus.succeeded'),
  failed: t('runStatus.failed'),
  limited: t('runStatus.limited'),
  canceled: t('runStatus.canceled'),
  timeout: t('runStatus.timeout')
}

export const DEPENDS_MODE_LABEL: Record<DependsMode, string> = {
  done: t('dependsMode.done'),
  finished: t('dependsMode.finished')
}

export const ADD_ACTION_LABEL: Record<AddAction, string> = {
  draft: t('addAction.draft'),
  held: t('addAction.held'),
  queued: t('addAction.queued'),
  now: t('addAction.now')
}
