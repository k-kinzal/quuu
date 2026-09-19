import { describe, expect, it } from 'vitest'
import { NEW_PROJECT, pruneDrafts, replyKey, setDraftIn } from '../src/lib/drafts.js'
import type { Drafts } from '../src/lib/drafts.js'

/**
 * Half-written text. Pins down that **it survives the screen going away**.
 *
 * On a phone screens vanish readily (moving between tabs, going to another app, the OS
 * reclaiming memory). Losing text there is not a usage mistake.
 */
describe('holding half-written text', () => {
  it('keeps nothing once emptied, so deleted keys do not pile up', () => {
    const one: Drafts = { 'task:t1': 'あとで' }
    expect(setDraftIn(one, 'task:t1', '')).toEqual({})
  })

  it('returns the same container for identical text, causing no redraw', () => {
    const one: Drafts = { 'task:t1': 'あとで' }
    expect(setDraftIn(one, 'task:t1', 'あとで')).toBe(one)
  })

  it('keeps a separate draft per task', () => {
    let drafts: Drafts = {}
    drafts = setDraftIn(drafts, replyKey('t1'), 'こっち')
    drafts = setDraftIn(drafts, replyKey('t2'), 'あっち')
    expect(drafts[replyKey('t1')]).toBe('こっち')
    expect(drafts[replyKey('t2')]).toBe('あっち')
  })
})

describe('dropping drafts whose target is gone', () => {
  it('does not keep a follow-up for a task that no longer exists', () => {
    const drafts: Drafts = { 'task:t1': 'のこす', 'task:gone': 'きえる' }
    expect(pruneDrafts(drafts, { taskIds: ['t1'], projectIds: [] })).toEqual({
      'task:t1': 'のこす'
    })
  })

  it('forgets a deleted project selection, so nothing is queued into a place that is gone', () => {
    const drafts: Drafts = { [NEW_PROJECT]: 'p-gone' }
    expect(pruneDrafts(drafts, { taskIds: [], projectIds: ['p1'] })).toEqual({})
  })

  it('keeps a new task in progress even with no target yet', () => {
    const drafts: Drafts = { 'new.title': '思いつき', 'new.body': '中身' }
    expect(pruneDrafts(drafts, { taskIds: [], projectIds: [] })).toEqual(drafts)
  })
})
