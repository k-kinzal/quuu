import { describe, expect, it } from 'vitest'
import type { Task } from '../src/main/tasks/types.js'
import { nextSend } from '../src/renderer/src/model/derive.js'

/**
 * What the next run will send is shown at the end of the conversation as "pending".
 * This only tests the decision of **what to show (and what not to)**.
 * Get the placement wrong and the destination of sent-back content vanishes from the screen.
 */

function task(over: Partial<Task> = {}): Task {
  return {
    id: 't1',
    projectId: 'p1',
    title: 'タイトル',
    prompt: '最初の指示',
    status: 'queued',
    priority: 2,
    seq: 0,
    scheduledAt: null,
    currentRunId: null,
    sessionId: null,
    agentOverrideId: null,
    pendingMessage: '',
    reservedMessage: '',
    reviewNote: '',
    dependsOn: [],
    source: 'user',
    ruleId: null,
    externalKey: null,
    archived: false,
    createdAt: '',
    updatedAt: '',
    doneAt: null,
    ...over
  }
}

describe('what the next run sends', () => {
  it('returns a sent-back follow-up in an editable form', () => {
    const next = nextSend(task({ sessionId: 's1', pendingMessage: 'ここも直して' }), true)
    expect(next).toEqual({ field: 'pendingMessage', value: 'ここも直して' })
  })

  it('returns nothing while running (never shows something already handed over as "about to be sent")', () => {
    const t = task({ status: 'running', sessionId: 's1', pendingMessage: 'ここも直して' })
    expect(nextSend(t, true)).toBeNull()
  })

  it('also returns the prompt of a task that never ran (editable in the same shape as after a run)', () => {
    expect(nextSend(task(), false)).toEqual({ field: 'prompt', value: '最初の指示' })
  })

  it('returns nothing when the task never ran and the prompt is empty (nothing to edit yet)', () => {
    expect(nextSend(task({ prompt: '  \n ' }), false)).toBeNull()
  })

  it('also returns the prompt of a task left as draft (the one place to edit before queueing stays the same)', () => {
    expect(nextSend(task({ status: 'draft' }), false)).toEqual({
      field: 'prompt',
      value: '最初の指示'
    })
  })

  it('a task that ran and failed returns the prompt that will be re-sent', () => {
    const next = nextSend(task({ status: 'failed' }), true)
    expect(next).toEqual({ field: 'prompt', value: '最初の指示' })
  })

  it('returns nothing in review with no follow-up (nothing to send next yet)', () => {
    expect(nextSend(task({ status: 'review', sessionId: 's1' }), true)).toBeNull()
  })

  it('a follow-up left after cancelling back to review is still unsent, so it is returned', () => {
    const t = task({ status: 'review', sessionId: 's1', pendingMessage: '途中で止めた続き' })
    expect(nextSend(t, true)).toEqual({ field: 'pendingMessage', value: '途中で止めた続き' })
  })

  it('whitespace-only follow-up is not treated as a follow-up', () => {
    const t = task({ status: 'queued', sessionId: 's1', pendingMessage: '  \n ' })
    expect(nextSend(t, true)).toEqual({ field: 'prompt', value: '最初の指示' })
  })
})
