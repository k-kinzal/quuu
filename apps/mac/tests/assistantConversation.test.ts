import { expect, it } from 'vitest'
import { assistantConversation } from '../src/renderer/src/model/assistantConversation.js'
import type { SessionMessage } from '../src/api/schemas/session.js'

it('keeps supplied context out of displayed requests while preserving the stored conversation and assistant replies', () => {
  const text = 'What should I do today?\n\n<quuu-assistant-context>Shared memory and proposal context\n</quuu-assistant-context>'
  const message: SessionMessage = { id: '1', role: 'user', blocks: [{ kind: 'text', text }], timestamp: null, model: null, isSidechain: false }
  const reply: SessionMessage = { ...message, id: '2', role: 'assistant' }
  expect(assistantConversation([message, reply])[0].blocks).toEqual([{ kind: 'text', text: 'What should I do today?' }])
  expect(message.blocks).toEqual([{ kind: 'text', text }])
  expect(assistantConversation([message, reply])[1]).toEqual(reply)
})

it('shows a proposal once and keeps the appended reply without changing its durable prompt', () => {
  const proposal = { taskId: 'p', projectId: 'project', title: 'Restore the conversation', reason: 'Two sessions lost their place.',
    prompt: 'Persist the selected conversation on restart.', confidence: 86, status: 'pending' as const, createdAt: '', respondedAt: null, executionTaskId: null }
  const context = `Discuss this proposed task: ${proposal.title}\n\nWhy: ${proposal.reason}\n\nSuggested work: ${proposal.prompt}`
  const message: SessionMessage = { id: '1', role: 'user', blocks: [{ kind: 'text', text: context + '\n\nCan it keep the scroll position too?' }], timestamp: null, model: null, isSidechain: false }
  expect(assistantConversation([message], proposal)[0].blocks).toEqual([{ kind: 'text', text: 'Can it keep the scroll position too?' }])
  expect(message.blocks[0]).toEqual({ kind: 'text', text: context + '\n\nCan it keep the scroll position too?' })
  const ordinary: SessionMessage = { ...message, blocks: [{ kind: 'text', text: `I would change this instruction: ${proposal.prompt}` }] }
  expect(assistantConversation([ordinary], proposal)[0]).toEqual(ordinary)
})
