import { describe, expect, it } from 'vitest'
import { orderAgents } from '../src/main/agents/types.js'
import type { Agent } from '../src/main/agents/types.js'

const agent = (id: string, concurrency: number, sortOrder: number, enabled = true): Agent => ({
  id, name: id, description: '', concurrency, sortOrder, enabled, fallbackAgentId: null,
  cooldownSeconds: 900, timeoutSeconds: 0, source: 'user', createdAt: '', updatedAt: '', command: 'agent', argsTemplate: [], resumeArgsTemplate: [], env: {}, limitPatterns: [], logAdapter: 'stdout'
})

describe('agent selection order', () => {
  const members = [agent('a', 2, 0), agent('b', 4, 1), agent('disabled', 1, 2, false)]
  it('the least-busy strategy picks by load relative to concurrency, not by raw count', () => {
    const active = new Map([['a', 1], ['b', 1]])
    expect(orderAgents('least-busy', members, active, null).map((a) => a.id)).toEqual(['b', 'a'])
  })
  it('round-robin advances past the previous pick and never selects a disabled agent', () => {
    expect(orderAgents('round-robin', members, new Map(), 'a').map((a) => a.id)).toEqual(['b', 'a'])
    expect(orderAgents('round-robin', members, new Map(), 'missing').map((a) => a.id)).toEqual(['a', 'b'])
  })
  it('the definition-order strategy keeps the order without mutating its input', () => {
    expect(orderAgents('priority', members, new Map(), 'a').map((a) => a.id)).toEqual(['a', 'b'])
    expect(members.map((a) => a.id)).toEqual(['a', 'b', 'disabled'])
  })
})
