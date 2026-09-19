import { describe, expect, it } from 'vitest'
import type { SessionMessage } from '../src/main/session/types.js'
import { mergeMessages } from '../src/renderer/src/model/mergeMessages.js'

const msg = (id: string, text: string): SessionMessage => ({
  id,
  role: 'assistant',
  isSidechain: false,
  timestamp: null,
  blocks: [{ kind: 'text', text }],
  model: null
})

const text = (m: SessionMessage): string =>
  m.blocks.map((b) => (b.kind === 'text' ? b.text : '')).join('')

describe('merging session appends', () => {
  it.each([{ messages: [] }, { messages: [msg('u1', '新しい会話')] }])('drops the provisional log when the read target changes (including an empty target)', ({ messages }) => {
    expect(mergeMessages([msg('stdout_0', '起動ログ')], {
      runId: 'r', sessionId: 's', messages, replaceFromId: null,
      replacement: { logPath: '/tmp/session.jsonl', exists: true, title: null, hasMore: false, totalMessages: messages.length }
    })).toEqual(messages)
  })

  it('appends new messages at the end', () => {
    const result = mergeMessages([msg('a', '1'), msg('b', '2')], {
      runId: 'r',
      sessionId: 's',
      messages: [msg('c', '3')],
      replaceFromId: null
    })
    expect(result.map((m) => m.id)).toEqual(['a', 'b', 'c'])
  })

  it('replaces existing ids (handles a tool_result arriving late)', () => {
    const result = mergeMessages([msg('a', '1'), msg('b', '2')], {
      runId: 'r',
      sessionId: 's',
      messages: [msg('b', '2 更新'), msg('c', '3')],
      replaceFromId: 'b'
    })
    expect(result.map((m) => m.id)).toEqual(['a', 'b', 'c'])
    expect(text(result[1])).toBe('2 更新')
  })

  it('does not duplicate even when replaceFromId points outside the visible window', () => {
    // Actual bug: when a message older than the window got rewritten, the same content showed up twice
    const current = [msg('b', '2'), msg('c', '3')]
    const result = mergeMessages(current, {
      runId: 'r',
      sessionId: 's',
      messages: [msg('b', '2 更新'), msg('c', '3'), msg('d', '4')],
      replaceFromId: 'a-not-in-window'
    })
    expect(result.map((m) => m.id)).toEqual(['b', 'c', 'd'])
    expect(text(result[0])).toBe('2 更新')
  })

  it('receiving the same event twice adds nothing (idempotent)', () => {
    const payload = {
      runId: 'r',
      sessionId: 's',
      messages: [msg('c', '3')],
      replaceFromId: null
    }
    const once = mergeMessages([msg('a', '1')], payload)
    const twice = mergeMessages(once, payload)
    expect(twice.map((m) => m.id)).toEqual(['a', 'c'])
  })

  it('an empty append returns the original array unchanged', () => {
    const current = [msg('a', '1')]
    expect(mergeMessages(current, { runId: 'r', sessionId: 's', messages: [], replaceFromId: null })).toBe(
      current
    )
  })
})
