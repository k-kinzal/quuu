import type { GroupStrategy, LogAdapter } from '../../../preload/api/agents.js'
import type { RunErrorKind } from '../../../preload/api/execution.js'
import type { CommitIdentityMode } from '../../../preload/api/settings.js'
import type { AddAction, DependsMode, Priority, RunStatus, TaskStatus } from '../../../preload/api/tasks.js'
import { t } from './i18n/index.js'

/**
 * Display copy used by the Mac screens and the native menus. No business rules.
 * The language is fixed at startup (model/i18n), so these can stay plain tables.
 */
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  draft: t('taskStatus.draft'),
  held: t('taskStatus.held'),
  queued: t('taskStatus.queued'),
  running: t('taskStatus.running'),
  review: t('taskStatus.review'),
  failed: t('taskStatus.failed'),
  done: t('taskStatus.done')
}

// Priorities are language-neutral codes, not copy.
export const PRIORITY_LABEL: Record<Priority, string> = {
  0: 'P0',
  1: 'P1',
  2: 'P2',
  3: 'P3'
}

export const DEPENDS_MODE_LABEL: Record<DependsMode, string> = {
  done: t('dependsMode.done'),
  finished: t('dependsMode.finished')
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

export const LOG_ADAPTER_LABEL: Record<LogAdapter, string> = {
  claude: t('logAdapter.claude'),
  codex: t('logAdapter.codex'),
  cursor: t('logAdapter.cursor'),
  grok: t('logAdapter.grok'),
  copilot: t('logAdapter.copilot'),
  agy: t('logAdapter.agy'),
  opencode: t('logAdapter.opencode'),
  stdout: t('logAdapter.stdout')
}

export const GROUP_STRATEGY_LABEL: Record<GroupStrategy, string> = {
  priority: t('groupStrategy.priority'),
  'round-robin': t('groupStrategy.round-robin'),
  'least-busy': t('groupStrategy.least-busy')
}

export const RUN_ERROR_KIND_LABEL: Record<RunErrorKind, string> = {
  limit: t('runErrorKind.limit'),
  auth: t('runErrorKind.auth'),
  timeout: t('runErrorKind.timeout'),
  spawn: t('runErrorKind.spawn'),
  'nonzero-exit': t('runErrorKind.nonzero-exit'),
  orphaned: t('runErrorKind.orphaned'),
  canceled: t('runErrorKind.canceled'),
  'no-agent': t('runErrorKind.no-agent')
}

export const COMMIT_IDENTITY_MODE_LABEL: Record<CommitIdentityMode, string> = {
  inherit: t('commitIdentityMode.inherit'),
  off: t('commitIdentityMode.off'),
  custom: t('commitIdentityMode.custom')
}

export const ADD_ACTION_LABEL: Record<AddAction, string> = {
  draft: t('addAction.draft'),
  held: t('addAction.held'),
  queued: t('addAction.queued'),
  now: t('addAction.now')
}
