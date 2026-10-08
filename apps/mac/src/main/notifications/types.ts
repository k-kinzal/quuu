export const NOTIFICATION_KINDS = ['review', 'failure', 'followUp', 'reportFailure', 'pullRequest', 'syncConflict', 'assistant'] as const
export type NotificationKind = typeof NOTIFICATION_KINDS[number]
export type SstpScripts = Record<NotificationKind, string[]>
export const EMPTY_SSTP_SCRIPTS: SstpScripts = {
  review: [], failure: [], followUp: [], reportFailure: [], pullRequest: [], syncConflict: [], assistant: []
}
