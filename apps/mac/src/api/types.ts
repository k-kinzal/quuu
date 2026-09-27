import type { ClientContext } from '@orpc/client'
import type { ContractRouterClient } from '@orpc/contract'
import type { contract } from './contract.js'
export type * from './schemas/agents.js'
export type * from './schemas/automation.js'
export type * from './schemas/desktop.js'
export type * from './schemas/execution.js'
export type * from './schemas/network.js'
export type * from './schemas/projects.js'
export type * from './schemas/report.js'
export type * from './schemas/review.js'
export type * from './schemas/session.js'
export type * from './schemas/settings.js'
export type * from './schemas/snapshot.js'
export type * from './schemas/tasks.js'
export type * from './schemas/workbench.js'
export type { QuuuEvents } from './events.js'

/** Both sending and receiving derive from the same contract. Never transcribe method, argument, or response declarations. */
export type QuuuApi<TContext extends ClientContext = Record<never, never>> = ContractRouterClient<typeof contract, TContext>

export type * from './schemas/runners.js'
