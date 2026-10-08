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
