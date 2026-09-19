import type { LogAdapter } from './agents/cliAdapter.js'
import type { GroupStrategy } from './agents/types.js'
import type { RunErrorKind } from './execution/types.js'
import { t } from './i18n/index.js'
import type { CommitIdentityMode } from './settings/identity.js'
import type { AddAction } from './tasks/addAction.js'
import type { DependsMode, Priority, RunStatus, TaskStatus } from './tasks/status.js'

/**
 * Display copy used by the Mac UI and the native menu. Holds no business rules.
 *
 * Main-process modules are evaluated before `initMainI18n`, so keeping these
 * as a table would bake in the English. Make them functions that look up at call time.
 */
export function taskStatusLabel(status: TaskStatus): string {
  return t(`taskStatus.${status}`)
}

// Priority is a language-independent symbol, so it stays a table.
export const PRIORITY_LABEL: Record<Priority, string> = {
  0: 'P0',
  1: 'P1',
  2: 'P2',
  3: 'P3'
}

export function dependsModeLabel(mode: DependsMode): string {
  return t(`dependsMode.${mode}`)
}

export function runStatusLabel(status: RunStatus): string {
  return t(`runStatus.${status}`)
}

export function logAdapterLabel(adapter: LogAdapter): string {
  return t(`logAdapter.${adapter}`)
}

export function groupStrategyLabel(strategy: GroupStrategy): string {
  return t(`groupStrategy.${strategy}`)
}

export function runErrorKindLabel(kind: RunErrorKind): string {
  return t(`runErrorKind.${kind}`)
}

export function commitIdentityModeLabel(mode: CommitIdentityMode): string {
  return t(`commitIdentityMode.${mode}`)
}

export function addActionLabel(action: AddAction): string {
  return t(`addAction.${action}`)
}
