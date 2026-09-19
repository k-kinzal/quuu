import { describe, expect, it } from 'vitest'
import { DRAFTS_KEY, loadDrafts, newTaskDraftKey, pruneDrafts, saveDrafts, setDraftIn, taskDraftKey } from '../src/renderer/src/state/drafts.js'
import type { DraftStorage, Drafts } from '../src/renderer/src/state/drafts.js'

/** A stand-in for localStorage whose contents can be read directly. */
function fakeStorage(initial: Record<string, string> = {}): DraftStorage & { raw: Map<string, string> } {
  const raw = new Map(Object.entries(initial))
  return {
    raw,
    getItem: (key) => raw.get(key) ?? null,
    setItem: (key, value) => void raw.set(key, value)
  }
}

/** Storage where every write throws (private mode, or over quota). */
const brokenStorage: DraftStorage = {
  getItem() {
    throw new Error('storage is unavailable')
  },
  setItem() {
    throw new Error('storage is unavailable')
  }
}

describe('draft keys', () => {
  it('gives each task its own draft', () => {
    expect(taskDraftKey('tsk_1')).not.toBe(taskDraftKey('tsk_2'))
  })

  it('gives a different queue destination its own draft (the all list and a project screen)', () => {
    expect(newTaskDraftKey()).toBe('new:all')
    expect(newTaskDraftKey('prj_1')).not.toBe(newTaskDraftKey())
  })
})

describe('replacing a draft', () => {
  it('reads back what was written by its key', () => {
    const drafts = setDraftIn({}, taskDraftKey('tsk_1'), '長い指示')
    expect(drafts[taskDraftKey('tsk_1')]).toBe('長い指示')
  })

  it('does not disturb the drafts of other tasks', () => {
    let drafts: Drafts = setDraftIn({}, taskDraftKey('tsk_1'), 'A の指示')
    drafts = setDraftIn(drafts, taskDraftKey('tsk_2'), 'B の指示')
    expect(drafts[taskDraftKey('tsk_1')]).toBe('A の指示')
    expect(drafts[taskDraftKey('tsk_2')]).toBe('B の指示')
  })

  it('drops the draft on an empty string (this is what happens after sending)', () => {
    const drafts = setDraftIn(setDraftIn({}, taskDraftKey('tsk_1'), '書いた'), taskDraftKey('tsk_1'), '')
    expect(taskDraftKey('tsk_1') in drafts).toBe(false)
  })

  it('returns the same reference when nothing changed (no pointless save or re-render)', () => {
    const before = setDraftIn({}, taskDraftKey('tsk_1'), '書いた')
    expect(setDraftIn(before, taskDraftKey('tsk_1'), '書いた')).toBe(before)
    expect(setDraftIn(before, taskDraftKey('tsk_9'), '')).toBe(before)
  })
})

describe('saving drafts', () => {
  it('reads back what was saved (it survives the window being rebuilt)', () => {
    const storage = fakeStorage()
    const drafts = setDraftIn({}, taskDraftKey('tsk_1'), '書きかけの指示\n2 行目')
    saveDrafts(storage, drafts)
    expect(loadDrafts(storage)).toEqual(drafts)
  })

  it('starts from empty when nothing was saved', () => {
    expect(loadDrafts(fakeStorage())).toEqual({})
  })

  it('does not stop startup on a corrupt save', () => {
    expect(loadDrafts(fakeStorage({ [DRAFTS_KEY]: '{壊れている' }))).toEqual({})
    expect(loadDrafts(fakeStorage({ [DRAFTS_KEY]: '["配列"]' }))).toEqual({})
  })

  it('does not load non-string values or empty strings', () => {
    const storage = fakeStorage({
      [DRAFTS_KEY]: JSON.stringify({ 'task:1': '生きている', 'task:2': 3, 'task:3': '' })
    })
    expect(loadDrafts(storage)).toEqual({ 'task:1': '生きている' })
  })

  it('does not throw when storage is unusable (what was typed stays on screen)', () => {
    expect(() => saveDrafts(brokenStorage, { 'task:1': '書いた' })).not.toThrow()
    expect(loadDrafts(brokenStorage)).toEqual({})
  })
})

describe('pruning drafts', () => {
  const drafts: Drafts = {
    [taskDraftKey('tsk_live')]: '生きているタスクの下書き',
    [taskDraftKey('tsk_gone')]: '消えたタスクの下書き',
    [newTaskDraftKey('prj_live')]: 'プロジェクトの画面で書いたもの',
    [newTaskDraftKey('prj_gone')]: '消えたプロジェクトで書いたもの',
    [newTaskDraftKey()]: '全体の一覧で書いたもの',
    'unknown:1': '古い版が書いたもの'
  }
  const pruned = pruneDrafts(drafts, { taskIds: ['tsk_live'], projectIds: ['prj_live'] })

  it('keeps a draft whose destination is still alive', () => {
    expect(pruned[taskDraftKey('tsk_live')]).toBe('生きているタスクの下書き')
    expect(pruned[newTaskDraftKey('prj_live')]).toBe('プロジェクトの画面で書いたもの')
  })

  it('always keeps the all-list draft, which has no destination', () => {
    expect(pruned[newTaskDraftKey()]).toBe('全体の一覧で書いたもの')
  })

  it('drops drafts whose destination is gone, and keys in an unknown shape', () => {
    expect(taskDraftKey('tsk_gone') in pruned).toBe(false)
    expect(newTaskDraftKey('prj_gone') in pruned).toBe(false)
    expect('unknown:1' in pruned).toBe(false)
  })

  it('does not mutate the original drafts', () => {
    expect(Object.keys(drafts)).toHaveLength(6)
  })
})
