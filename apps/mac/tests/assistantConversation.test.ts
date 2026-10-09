import { expect, it } from 'vitest'
import { assistantConversation } from '../src/renderer/src/model/assistantConversation.js'
import type { SessionMessage } from '../src/api/schemas/session.js'

it('does not render an empty assistant bubble after a silent turn and retains subsequent conversation', () => {
  const message: SessionMessage = { id: 'thanks', role: 'user', blocks: [{ kind: 'text', text: 'ありがとう' }], timestamp: null, model: null, isSidechain: false }
  const empty: SessionMessage = { ...message, id: 'empty', role: 'assistant', blocks: [{ kind: 'text', text: ' \n\t' }] }
  const next: SessionMessage = { ...message, id: 'question', blocks: [{ kind: 'text', text: '次の質問です' }] }
  const reply: SessionMessage = { ...empty, id: 'answer', blocks: [{ kind: 'text', text: '回答です' }] }
  expect(assistantConversation([message, empty, { ...empty, id: 'no-blocks', blocks: [] }, next, reply])).toEqual([message, next, reply])
})

it('hides the no-reply control call without hiding failed calls, real work or prose', () => {
  const command = 'quuu call assistant.noReply \'{"runId":"run_123"}\''
  const message: SessionMessage = { id: 'control', role: 'assistant', timestamp: null, model: null, isSidechain: false,
    blocks: [{ kind: 'tool', tool: { id: 'tool', name: 'Bash', input: { command }, target: null, result: '', isError: false, images: [] } }] }
  expect(assistantConversation([message])).toEqual([])
  const block = message.blocks[0]
  if (block.kind !== 'tool') throw new Error('Expected a tool')
  const failed = { ...message, blocks: [{ ...block, tool: { ...block.tool, isError: true, result: 'Operation failed' } }] }
  expect(assistantConversation([failed])).toEqual([failed])
  const mixed = { ...message, blocks: [{ ...block, tool: { ...block.tool, input: { command: command + '; quuu tasks list' } } }] }
  expect(assistantConversation([mixed])).toEqual([mixed])
  const prose: SessionMessage = { ...message, blocks: [{ kind: 'text', text: command }] }
  expect(assistantConversation([prose])).toEqual([prose])
  const mcp = { ...message, blocks: [{ ...block, tool: { ...block.tool, name: 'mcp__quuu__assistant_noReply', input: { runId: 'run_123' } } }] }
  expect(assistantConversation([mcp])).toEqual([])
  expect(message.blocks).toHaveLength(1)
})

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
