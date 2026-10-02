/**
 * Every name Quuu's telemetry carries, in one place (docs/telemetry.md explains what each answers).
 *
 * Two readers query these: someone fixing a bug, who needs the failure with its stack and what led
 * to it, and someone reading how Quuu is used, who needs which operations, screens and features a
 * person reaches for and where they stall. Values describe **shape, never content**: field names,
 * ids, kinds and counts. Task titles, prompts, follow-ups and file contents are never exported.
 */
export const ATTR = {
  operation: 'quuu.operation',
  operationGroup: 'quuu.operation.group',
  operationRoute: 'quuu.operation.route',
  operationInputFields: 'quuu.operation.input.fields',
  operationPatchFields: 'quuu.operation.patch.fields',
  operationTargetId: 'quuu.operation.target_id',
  operationResult: 'quuu.operation.result',
  callerKind: 'quuu.caller.kind',
  callerAgentRun: 'quuu.caller.agent_run',

  taskId: 'quuu.task.id',
  taskLifecycle: 'quuu.task.lifecycle',
  taskStatus: 'quuu.task.status',
  taskPriority: 'quuu.task.priority',
  taskSource: 'quuu.task.source',
  taskAutomated: 'quuu.task.automated',
  taskAgentPinned: 'quuu.task.agent_pinned',
  taskDependencies: 'quuu.task.dependencies',
  taskAgeSeconds: 'quuu.task.age_seconds',
  taskRunCount: 'quuu.task.run_count',
  taskFollowupCount: 'quuu.task.followup_count',
  projectId: 'quuu.project.id',
  projectName: 'quuu.project.name',

  runId: 'quuu.run.id',
  runKind: 'quuu.run.kind',
  runStatus: 'quuu.run.status',
  runAttempt: 'quuu.run.attempt',
  runFallback: 'quuu.run.fallback',
  runErrorKind: 'quuu.run.error_kind',
  runExitCode: 'quuu.run.exit_code',
  runRemote: 'quuu.run.remote',
  runSource: 'quuu.run.source',
  agentId: 'quuu.agent.id',
  agentName: 'quuu.agent.name',
  agentAdapter: 'quuu.agent.adapter',
  agentGroupId: 'quuu.agent.group_id',

  uiScreen: 'quuu.ui.screen',
  uiPreviousScreen: 'quuu.ui.previous_screen',
  uiPreviousDurationMs: 'quuu.ui.previous_duration_ms',
  uiAction: 'quuu.ui.action',
  uiFields: 'quuu.ui.fields',
  uiCommand: 'quuu.ui.command',
  uiTrigger: 'quuu.ui.trigger',
  uiFocused: 'quuu.ui.focused',

  notificationKind: 'quuu.notification.kind',
  notificationLevel: 'quuu.notification.level',

  errorOrigin: 'quuu.error.origin',
  /** The fixed text a console line starts with ('Hook processing failed'), for grouping. */
  logLabel: 'quuu.log.label',

  // OpenTelemetry semantic conventions
  errorType: 'error.type',
  exceptionType: 'exception.type',
  exceptionMessage: 'exception.message',
  exceptionStacktrace: 'exception.stacktrace'
} as const

/** `event.name` of each log record Quuu emits. */
export const EVENT = {
  appStarted: 'quuu.app.started',
  appQuit: 'quuu.app.quit',
  appFocus: 'quuu.app.focus',
  settingsProfile: 'quuu.settings.profile',
  taskLifecycle: 'quuu.task.lifecycle',
  uiScreen: 'quuu.ui.screen',
  uiAction: 'quuu.ui.action',
  uiCommand: 'quuu.ui.command',
  notification: 'quuu.notification',
  error: 'quuu.error',
  log: 'quuu.log'
} as const

/** Span names. Operation spans are named by the operation itself (`tasks.create`). */
export const SPAN = {
  run: 'quuu.run'
} as const

/** Where an error was caught, so a query can tell a crash from a logged complaint. */
export type ErrorOrigin =
  | 'main.uncaught'
  | 'main.unhandled_rejection'
  | 'main.render_process_gone'
  | 'main.child_process_gone'
  | 'renderer.uncaught'
  | 'renderer.unhandled_rejection'
  | 'renderer.render'

export type CallerKind = 'window' | 'cli' | 'mcp' | 'satellite'
