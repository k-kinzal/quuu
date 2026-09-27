import { describe, expect, it } from 'vitest'
import type { AgentSlotStatus } from '../src/api/schemas/execution.js'
import { slotCells, slotSummary } from '../src/renderer/src/model/slotGauge.js'

function agent(overrides: Partial<AgentSlotStatus>): AgentSlotStatus {
  return {
    agentId: 'a',
    agentName: 'Claude',
    concurrency: 1,
    active: 0,
    reserved: 0,
    cooldownUntil: null,
    cooldownReason: '',
    enabled: true,
    ...overrides
  }
}

const NOW = Date.parse('2026-09-28T10:00:00')
const LATER = new Date('2026-09-28T15:30:00').toISOString()

/**
 * The footer gauge. Its colors alone never said whose slot was on Limit, so each cell and
 * the gauge as a whole must name the agent and the state on hover.
 */
describe('slot gauge', () => {
  it('fills each agent running → reserved → free, and every cell names its agent and state', () => {
    const cells = slotCells([agent({ agentName: 'Claude', concurrency: 3, active: 1, reserved: 1 })], NOW)
    expect(cells.map((c) => c.state)).toEqual(['running', 'reserved', 'free'])
    expect(cells.map((c) => c.title)).toEqual([
      'Claude — running',
      'Claude (reserved)',
      'Claude — free'
    ])
  })

  it('shows a free slot of an agent on Limit as Limit, with when it comes back', () => {
    const cells = slotCells([agent({ agentName: 'Codex', concurrency: 2, active: 1, cooldownUntil: LATER })], NOW)
    expect(cells.map((c) => c.state)).toEqual(['running', 'limit'])
    expect(cells[1].title).toBe('Codex — Limit, back at 15:30')
  })

  it('leaves disabled agents out of both the cells and the summary', () => {
    const agents = [agent({ agentName: 'Claude' }), agent({ agentId: 'b', agentName: 'Gemini', enabled: false })]
    expect(slotCells(agents, NOW)).toHaveLength(1)
    expect(slotSummary(agents, NOW)).not.toContain('Gemini')
  })

  it('summarizes every enabled agent on its own line', () => {
    const summary = slotSummary(
      [
        agent({ agentName: 'Claude', concurrency: 3, active: 2, reserved: 1 }),
        agent({ agentId: 'b', agentName: 'Codex', concurrency: 2, cooldownUntil: LATER })
      ],
      NOW
    )
    expect(summary.split('\n').slice(1)).toEqual([
      'Claude: 2 / 3 running, 1 reserved',
      'Codex: 0 / 2 running, Limit, back at 15:30'
    ])
  })
})
