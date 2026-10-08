import { z } from 'zod'

export const NotificationKindSchema = z.enum(['review', 'failure', 'followUp', 'reportFailure', 'pullRequest', 'syncConflict', 'assistant'])
export type NotificationKind = z.infer<typeof NotificationKindSchema>
const scripts = z.string().max(16000).refine(value => !value.includes('\0')).array().max(100)
export const SstpScriptsSchema = z.object({
  review: scripts, failure: scripts, followUp: scripts, reportFailure: scripts, pullRequest: scripts, syncConflict: scripts, assistant: scripts
})
export type SstpScripts = z.infer<typeof SstpScriptsSchema>
