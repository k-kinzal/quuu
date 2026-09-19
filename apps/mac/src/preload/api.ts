import type { ClientContext } from '@orpc/client'
import type { ContractRouterClient } from '@orpc/contract'
import type { contract } from './contract.js'
export type * from './api/agents.js'
export type * from './api/automation.js'
export type * from './api/desktop.js'
export type * from './api/execution.js'
export type * from './api/projects.js'
export type * from './api/report.js'
export type * from './api/review.js'
export type * from './api/session.js'
export type * from './api/settings.js'
export type * from './api/snapshot.js'
export type * from './api/tasks.js'
export type * from './api/workbench.js'
export type { QuuuEvents } from './events.js'

/** Both sending and receiving derive from the same contract. Never transcribe method, argument, or response declarations. */
export type QuuuApi<TContext extends ClientContext = Record<never, never>> = ContractRouterClient<typeof contract, TContext>
