import type { Invocation, InvocationRequest } from '../agent-clis/invocation.js'
import type { CliDriver } from '../agent-clis/types.js'
import type { LogAdapter } from '../agents/cliAdapter.js'
import type { RunOutcome } from '../execution/types.js'
import type { MessageBuffer } from '../session/messageBuffer.js'
import type { SessionMessage } from '../session/types.js'
import type { SessionCandidate } from './discovery.js'
import type { ExternalLogs } from './external.js'
import type { AdapterLayout } from './layout.js'
import type { ProviderLiveness } from './liveness.js'
import type { PushResult, StoreReloadResult } from './parserUtil.js'
import type { Classification, ClassifyInput } from './result.js'
import type { SessionLookup } from './sessionLookup.js'

interface ConversationParser {
  readonly messages: SessionMessage[]
  title: string | null
  readonly images?: { get(id: string): string | null; release(id: string): void }
}
export interface StreamParser extends ConversationParser {
  pushLines(lines: string[]): PushResult
  pushChunk?(chunk: string): void
}
export interface StoreParser extends ConversationParser { reload(path: string, sessionId: string): StoreReloadResult }
export type SessionParser = StreamParser | StoreParser
export function isStoreParser(parser: SessionParser): parser is StoreParser { return 'reload' in parser }

/** The only provider contract consumed by Quuu's execution and session services. */
export interface AgentAdapter {
  id: LogAdapter
  cli: CliDriver | null
  invoke(request: InvocationRequest): Invocation
  layout: AdapterLayout
  recoverSessionId?(lookup: SessionLookup): string | null
  sessionIdInStdout?(path: string): string | null
  external?: ExternalLogs
  sessionCandidates?(cwd: string): SessionCandidate[]
  logMentions?(candidate: SessionCandidate, head: string): boolean
  probeLiveness?(now: number): ProviderLiveness
  resetLiveness?(): void
  idleWindowMs: number
  parserVersion: string
  createParser(imageNamespace?: string, buffer?: MessageBuffer): SessionParser
  classify(input: ClassifyInput): Classification
  classifyDetached(input: { output: string; limitPatterns: string[] }): Classification
  retryAt(classification: Classification, history: readonly RunOutcome[]): string | null
}
