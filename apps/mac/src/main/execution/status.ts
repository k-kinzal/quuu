// ---------------------------------------------------------------------------
// Scheduler / operating status
// ---------------------------------------------------------------------------

export interface AgentSlotStatus {
  agentId: string
  agentName: string
  concurrency: number
  active: number
  /**
   * How many slots are reserved and will not go to another task.
   * Both a P0 task's hold and the lane kept open for an agent that falls back here.
   */
  reserved: number
  cooldownUntil: string | null
  cooldownReason: string
  enabled: boolean
}

/** A task keeping a run slot (an unfinished P0 task). */
export interface SlotHold {
  taskId: string
  taskTitle: string
  projectName: string
  /** The agent being kept free. null when it has never run (the project slot only). */
  agentName: string | null
}

export interface SchedulerStatus {
  running: boolean
  /** Total number of running runs. */
  activeRuns: number
  /** Sum of every agent's concurrency (enabled ones only). */
  totalSlots: number
  queued: number
  review: number
  failed: number
  agents: AgentSlotStatus[]
  /** The tasks holding a slot right now. Empty when all is well. */
  holds: SlotHold[]
  /** Recent warnings from the scheduler. Empty when all is well. */
  warnings: string[]
  lastTickAt: string | null
}
