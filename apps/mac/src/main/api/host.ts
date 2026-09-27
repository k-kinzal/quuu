import type { QuuuApi } from '../../api/types.js'
import type { EventPayloads } from '../../api/events.js'
import type { PullRequestViewBounds } from '../terminal/types.js'
import type { ReviewActionResult } from '../review/types.js'
import type { z } from 'zod'
import type { DocumentViewSchema } from '../../api/schemas/documents.js'

type LocalCalls<T> = { [K in keyof T]: T[K] extends (input: infer I, ...args: never[]) => Promise<infer O> ? undefined extends I ? (input?: I) => O | Promise<O> : (input: I) => O | Promise<O> : never }

export type DesktopOperations = LocalCalls<Omit<QuuuApi['system'], 'savePromptFiles'>> &
  LocalCalls<Pick<QuuuApi['settings'], 'lookupBotUser' | 'createGitHubApp' | 'cancelGitHubApp'>> &
  LocalCalls<Pick<QuuuApi['review'], 'openPullRequest' | 'hidePullRequest' | 'closePullRequest'>> & {
    showReport(request: { file: string; bounds: PullRequestViewBounds }): ReviewActionResult
    hideReport(): ReviewActionResult
    showDocument(request: z.infer<typeof DocumentViewSchema>): Promise<ReviewActionResult>
    hideDocument(): ReviewActionResult
    navigateDocument(direction: 'back' | 'forward' | 'reload'): void
  }

/** A caller owns its views and terminals, regardless of the transport that admitted it. */
export interface OperationHost<Owner> {
  authorize(owner: Owner): void
  releaseWithOwner(owner: Owner, cleanup: () => void): () => void
  sendEvent<K extends keyof EventPayloads>(owner: Owner, event: K, payload: EventPayloads[K]): void
  desktopFor(owner: Owner): DesktopOperations
}
