import { ORPCError } from '@orpc/client'
import type { QuuuApi } from '../../../preload/api.js'
import { t } from './i18n/index.js'

type OperationLabels<T> = { [K in keyof T]: T[K] extends (...args: never[]) => unknown ? string : OperationLabels<T[K]> }
/** The View owns the wording. Adding an operation to the contract means deciding how its failure is told. */
const labels: OperationLabels<QuuuApi> = {
  snapshot: t('operationFailure.op.snapshot'),
  projects: { list: t('operationFailure.op.projects.list'), create: t('operationFailure.op.projects.create'), update: t('operationFailure.op.projects.update'), remove: t('operationFailure.op.projects.remove') },
  tasks: { create: t('operationFailure.op.tasks.create'), update: t('operationFailure.op.tasks.update'), enqueue: t('operationFailure.op.tasks.enqueue'), unqueue: t('operationFailure.op.tasks.unqueue'), hold: t('operationFailure.op.tasks.hold'), runNow: t('operationFailure.op.tasks.runNow'), markDone: t('operationFailure.op.tasks.markDone'), reopen: t('operationFailure.op.tasks.reopen'), sendBack: t('operationFailure.op.tasks.sendBack'), cancel: t('operationFailure.op.tasks.cancel'), remove: t('operationFailure.op.tasks.remove'), archive: t('operationFailure.op.tasks.archive'), send: t('operationFailure.op.tasks.send'), clearReserved: t('operationFailure.op.tasks.clearReserved') },
  rules: { preview: t('operationFailure.op.rules.preview'), create: t('operationFailure.op.rules.create'), update: t('operationFailure.op.rules.update'), remove: t('operationFailure.op.rules.remove'), enqueue: t('operationFailure.op.rules.enqueue') },
  agents: { defaults: t('operationFailure.op.agents.defaults'), create: t('operationFailure.op.agents.create'), update: t('operationFailure.op.agents.update'), duplicate: t('operationFailure.op.agents.duplicate'), resetLimit: t('operationFailure.op.agents.resetLimit'), remove: t('operationFailure.op.agents.remove') },
  groups: { create: t('operationFailure.op.groups.create'), update: t('operationFailure.op.groups.update'), remove: t('operationFailure.op.groups.remove') },
  runs: { byTask: t('operationFailure.op.runs.byTask'), cancel: t('operationFailure.op.runs.cancel') },
  session: { close: t('operationFailure.op.session.close'), load: t('operationFailure.op.session.load'), loadMore: t('operationFailure.op.session.loadMore'), image: t('operationFailure.op.session.image') },
  scheduler: { status: t('operationFailure.op.scheduler.status'), pause: t('operationFailure.op.scheduler.pause'), resume: t('operationFailure.op.scheduler.resume') },
  settings: { previewIdentity: t('operationFailure.op.settings.previewIdentity'), setIdentity: t('operationFailure.op.settings.setIdentity'), get: t('operationFailure.op.settings.get'), set: t('operationFailure.op.settings.set'), lookupBotUser: t('operationFailure.op.settings.lookupBotUser'), createGitHubApp: t('operationFailure.op.settings.createGitHubApp'), cancelGitHubApp: t('operationFailure.op.settings.cancelGitHubApp') },
  mobile: { status: t('operationFailure.op.mobile.status'), syncNow: t('operationFailure.op.mobile.syncNow') }, importer: { sync: t('operationFailure.op.importer.sync') },
  open: { terminal: t('operationFailure.op.open.terminal'), resume: t('operationFailure.op.open.resume'), editor: t('operationFailure.op.open.editor'), reveal: t('operationFailure.op.open.reveal'), workingDir: t('operationFailure.op.open.workingDir'), editors: t('operationFailure.op.open.editors') },
  review: { refresh: t('operationFailure.op.review.snapshot'), snapshot: t('operationFailure.op.review.snapshot'), file: t('operationFailure.op.review.file'), comment: t('operationFailure.op.review.comment'), openPullRequest: t('operationFailure.op.review.openPullRequest'), hidePullRequest: t('operationFailure.op.review.hidePullRequest'), closePullRequest: t('operationFailure.op.review.closePullRequest') },
  report: { get: t('operationFailure.op.report.get'), generate: t('operationFailure.op.report.generate'), show: t('operationFailure.op.report.show'), hide: t('operationFailure.op.report.hide') },
  terminal: { open: t('operationFailure.op.terminal.open'), input: t('operationFailure.op.terminal.input'), resize: t('operationFailure.op.terminal.resize'), runProjectTask: t('operationFailure.op.terminal.runProjectTask'), close: t('operationFailure.op.terminal.close') },
  system: { savePromptFiles: t('promptFiles.save'), windowLayout: t('operationFailure.op.system.windowLayout'), scrollSwipes: t('operationFailure.op.system.scrollSwipes'), pickDirectory: t('operationFailure.op.system.pickDirectory'), pickApplication: t('operationFailure.op.system.pickApplication'), confirm: t('operationFailure.op.system.confirm'), popupMenu: t('operationFailure.op.system.popupMenu'), reveal: t('operationFailure.op.system.reveal'), openExternal: t('operationFailure.op.system.openExternal'), copy: t('operationFailure.op.system.copy') }
}

export function failureReason(error: unknown): string {
  if (error instanceof ORPCError) {
    const data: unknown = error.data
    if (error.code === 'OPERATION_FAILED' && data && typeof data === 'object' && 'reason' in data && typeof data.reason === 'string') return data.reason
    if (error.code === 'BAD_REQUEST') return t('operationFailure.badRequest')
    if (error.code === 'FORBIDDEN') return t('operationFailure.forbidden')
    if (error.code === 'INTERNAL_SERVER_ERROR') return t('operationFailure.internal')
  }
  if (error && typeof error === 'object' && 'reason' in error && typeof error.reason === 'string') return error.reason
  if (error instanceof Error && error.message) return error.message
  return t('operationFailure.unknown')
}

export function failureMessage(path: readonly string[]): string {
  let label: unknown = labels
  for (const part of path) label = label && typeof label === 'object' && part in label ? Reflect.get(label, part) : undefined
  return t('operationFailure.failed', { operation: typeof label === 'string' ? label : t('operationFailure.fallbackOperation') })
}
