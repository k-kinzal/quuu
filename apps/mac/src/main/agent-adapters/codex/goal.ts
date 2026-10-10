import { readLogTail } from '../../platform/runProcess.js'
import type { AgentAdapter } from '../types.js'

interface Entry {
  type?: string
  timestamp?: string
  metadata?: { client_authored?: boolean }
  payload?: {
    type?: string
    turn_id?: string
    role?: string
    reason?: string
    collaboration_mode_kind?: string
    internal_chat_message_metadata_passthrough?: {
      turn_id?: string
      content_item_kinds?: unknown
    }
  }
}

/**
 * Codex 0.160.1 dispatches a goal turn after task_complete, then exec shuts down and
 * interrupts it before it can answer. Trust that native dispatch, not goal wording or
 * an old create_goal result: Codex has already checked status, budget and progress.
 * A bounded tail keeps multi-hour rollouts off the scheduler's synchronous hot path.
 */
export const pendingGoalContinuation: NonNullable<AgentAdapter['pendingContinuation']> = (run) => {
  if (!run.sessionLogPath || run.args[0] !== 'exec' || run.args[1] === 'review') return false
  const since = Date.parse(run.startedAt)
  if (!Number.isFinite(since)) return false
  const tail = readLogTail(run.sessionLogPath, 1024 * 1024)
  let completedAt: number | null = null
  let usedTool = false
  let turn: { id: string; at: number; goal: boolean; interrupted: boolean } | null = null
  for (const line of tail.split('\n')) {
    if (!line.trim()) continue
    let entry: Entry | null
    try { entry = JSON.parse(line) as Entry | null } catch {
      // Includes a truncated first line; incomplete evidence must never trigger execution.
      completedAt = null
      turn = null
      usedTool = false
      continue
    }
    if (!entry?.payload) continue
    const at = Date.parse(entry.timestamp ?? '')
    if (!Number.isFinite(at)) { completedAt = null; turn = null; usedTool = false; continue }
    if (at < since) continue
    const payload = entry.payload
    if (entry.type === 'event_msg') {
      if (payload.type === 'task_complete') {
        // Resuming exec resends the original input. Do not let that reset Codex's
        // no-tool-call guard and turn answer-only runs into an endless retry loop.
        completedAt = usedTool ? at : null
        usedTool = false
        turn = null
      } else if (payload.type === 'task_started') {
        turn = completedAt !== null && at >= completedAt && at - completedAt <= 5000 &&
          payload.collaboration_mode_kind === 'default' && typeof payload.turn_id === 'string'
          ? { id: payload.turn_id, at, goal: false, interrupted: false } : null
        completedAt = null
        usedTool = false
      } else if (payload.type === 'turn_aborted') {
        if (turn && payload.turn_id === turn.id && payload.reason === 'interrupted' &&
          at >= turn.at && at - turn.at <= 5000) turn.interrupted = true
        else turn = null
      } else if (payload.type === 'user_message' || payload.type === 'error') {
        turn = null
      }
    } else if (entry.type === 'response_item') {
      const tool = typeof payload.type === 'string' && payload.type.endsWith('_call')
      if (tool) usedTool = true
      if (turn && payload.type === 'message' && payload.role === 'user') {
        const metadata = payload.internal_chat_message_metadata_passthrough
        if (!turn.goal && entry.metadata?.client_authored !== true &&
          metadata?.turn_id === turn.id && Array.isArray(metadata.content_item_kinds) &&
          metadata.content_item_kinds.includes('goal.internal_context')) turn.goal = true
        else turn = null
      } else if (turn && (payload.role === 'assistant' || payload.type === 'reasoning' || tool)) {
        // A turn that actually ran is not the exec shutdown race we can safely recover.
        turn = null
      }
    }
  }
  return turn?.goal === true && turn.interrupted
}
