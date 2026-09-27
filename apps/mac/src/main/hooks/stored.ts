import type { LogAdapter } from '../agents/cliAdapter.js'
import type { Project } from '../projects/types.js'
import type { HookRun, ResolvedHook } from './types.js'

export interface StoredHookRun extends HookRun {
  definition: ResolvedHook
  project: Project
  pid: number | null
  exitPath: string
  authDir: string | null
  sessionId: string
  logAdapter: LogAdapter | null
  limitPatterns: string[]
}
