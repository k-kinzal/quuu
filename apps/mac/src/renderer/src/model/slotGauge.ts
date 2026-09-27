import type { AgentSlotStatus } from '../../../api/schemas/execution.js'
import { clockOrDate } from './format.js'
import { t } from './i18n/index.js'

export type SlotState = 'running' | 'reserved' | 'limit' | 'free'

export interface SlotCell {
  state: SlotState
  title: string
}

/**
 * One cell per enabled slot, filled running → reserved → free. Reserved is "a slot that's
 * free but won't be handed out"; a free slot of an agent on Limit cannot be handed out
 * either, so it shows as Limit.
 *
 * Every cell names its agent and state: the colors alone never said whose slot had died,
 * and finding out meant a trip to the agent settings.
 */
export function slotCells(agents: AgentSlotStatus[], now = Date.now()): SlotCell[] {
  const cells: SlotCell[] = []
  for (const agent of agents) {
    if (!agent.enabled) continue
    const name = agent.agentName
    for (let i = 0; i < agent.concurrency; i++) {
      if (i < agent.active) {
        cells.push({ state: 'running', title: t('footer.slotRunning', { name }) })
      } else if (i < agent.active + agent.reserved) {
        cells.push({ state: 'reserved', title: t('footer.slotReserved', { name }) })
      } else if (agent.cooldownUntil) {
        cells.push({
          state: 'limit',
          title: t('footer.slotLimit', { name, time: clockOrDate(agent.cooldownUntil, now) })
        })
      } else {
        cells.push({ state: 'free', title: t('footer.slotFree', { name }) })
      }
    }
  }
  return cells
}

/** The whole gauge's hover: one line per enabled agent, so the cells can be read without aiming at them. */
export function slotSummary(agents: AgentSlotStatus[], now = Date.now()): string {
  const lines = agents
    .filter((agent) => agent.enabled)
    .map((agent) => {
      const parts = [
        t('footer.agentRunning', {
          name: agent.agentName,
          active: agent.active,
          total: agent.concurrency
        })
      ]
      if (agent.reserved > 0) parts.push(t('footer.agentReserved', { reserved: agent.reserved }))
      if (agent.cooldownUntil) {
        parts.push(t('footer.agentLimit', { time: clockOrDate(agent.cooldownUntil, now) }))
      }
      return parts.join(t('footer.agentSeparator'))
    })
  return [t('footer.slotsTitle'), ...lines].join('\n')
}
