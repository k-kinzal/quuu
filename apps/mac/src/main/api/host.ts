import type { QuuuApi } from '../../api/types.js'
import type { EventPayloads } from '../../api/events.js'
import type { PullRequestViewBounds } from '../terminal/types.js'
import type { ReviewActionResult } from '../review/types.js'
import type { z } from 'zod'
import type { DocumentViewSchema } from '../../api/schemas/documents.js'
import type { OperationCaller } from '../telemetry/index.js'

type LocalCalls<T> = { [K in keyof T]: T[K] extends (input: infer I, ...args: never[]) => Promise<infer O> ? undefined extends I ? (input?: I) => O | Promise<O> : (input: I) => O | Promise<O> : never }

export type DesktopOperations = LocalCalls<Omit<QuuuApi['system'], 'savePromptFiles'>> &
  LocalCalls<Pick<QuuuApi['settings'], 'lookupBotUser' | 'createGitHubApp' | 'cancelGitHubApp' | 'githubWebStatus' | 'githubWebSignIn' | 'githubWebSignOut'>> &
  LocalCalls<Pick<QuuuApi['review'], 'openPullRequest' | 'hidePullRequest' | 'closePullRequest'>> & {
    showReport(request: { file: string; bounds: PullRequestViewBounds }): ReviewActionResult
    hideReport(): ReviewActionResult
    showDocument(request: z.infer<typeof DocumentViewSchema>): Promise<ReviewActionResult>
    hideDocument(): ReviewActionResult
    navigateDocument(direction: 'back' | 'forward' | 'reload'): void
  }

/** The host a satellite's window is showing. Its operations are answered there. */
export interface ForwardedOperations {
  call(name: string, input: unknown): Promise<unknown>
}

/*
 * What a satellite answers itself. Its window operates the host through the same operations, except
 * what acts on this computer's own screen, and this computer's own place in the network.
 */
const ANSWERED_HERE = new Set([
  'system.windowLayout', 'system.scrollSwipes', 'system.pickDirectory', 'system.pickApplication', 'system.confirm',
  'system.popupMenu', 'system.openExternal', 'system.copy',
  'settings.lookupBotUser', 'settings.createGitHubApp', 'settings.cancelGitHubApp',
  // The GitHub pages are shown on this computer's screen, so their sign-in is this computer's too.
  'settings.githubWebStatus', 'settings.githubWebSignIn', 'settings.githubWebSignOut',
  'review.openPullRequest', 'review.hidePullRequest', 'review.closePullRequest',
  'documents.hide', 'documents.navigate', 'report.hide'
])
/** Operations that open the host's files on a screen. Forwarded, they would appear on the host's screen instead. */
const ON_HOST_SCREEN = new Set(['open.terminal', 'open.resume', 'open.editor', 'open.reveal', 'system.reveal', 'report.show', 'report.projectShow', 'documents.show'])

export function satelliteRoute(name: string): 'here' | 'host' | 'unavailable' {
  if (ANSWERED_HERE.has(name) || name.startsWith('network.') || name.startsWith('app.')) return 'here'
  return ON_HOST_SCREEN.has(name) ? 'unavailable' : 'host'
}

/** A caller owns its views and terminals, regardless of the transport that admitted it. */
export interface OperationHost<Owner> {
  authorize(owner: Owner): void
  /** Who is calling: a window, the CLI (from an agent run or not), an MCP client or a satellite. */
  callerOf(owner: Owner): OperationCaller
  /** The host that answers this owner's operations while this Quuu is its satellite; absent or null otherwise. */
  forwardFor?(owner: Owner): ForwardedOperations | null
  releaseWithOwner(owner: Owner, cleanup: () => void): () => void
  sendEvent<K extends keyof EventPayloads>(owner: Owner, event: K, payload: EventPayloads[K]): void
  desktopFor(owner: Owner): DesktopOperations
}
