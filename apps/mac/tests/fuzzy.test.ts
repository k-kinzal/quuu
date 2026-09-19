import { describe, expect, it } from 'vitest'
import { fuzzyMatch, splitByRanges } from '../src/renderer/src/model/fuzzy.js'

describe('command palette fuzzy matching', () => {
  it('matches as a subsequence', () => {
    expect(fuzzyMatch('qst', 'Queue ではなく Stream にする')).not.toBeNull()
    expect(fuzzyMatch('zzz', 'Queue ではなく Stream にする')).toBeNull()
  })

  it('picks up Japanese substring matches', () => {
    expect(fuzzyMatch('ストリーム', 'Queue ではなくストリームにする')).not.toBeNull()
    expect(fuzzyMatch('筆圧', 'ApplePencil の筆圧と描画追従')).not.toBeNull()
  })

  it('whitespace-separated terms are ANDed', () => {
    expect(fuzzyMatch('doc actions', 'doc 生成用の actions を作る')).not.toBeNull()
    expect(fuzzyMatch('doc 存在しない', 'doc 生成用の actions を作る')).toBeNull()
  })

  it('scores consecutive and prefix matches higher', () => {
    const exact = fuzzyMatch('stream', 'Stream にする')!
    const scattered = fuzzyMatch('stream', 'Set The Run Extra Any Mode')!
    expect(exact.score).toBeGreaterThan(scattered.score)
  })

  it('favors shorter targets', () => {
    const short = fuzzyMatch('blog', 'blog')!
    const long = fuzzyMatch('blog', 'blog の非常に長いタスクのタイトルがここに続く')!
    expect(short.score).toBeGreaterThan(long.score)
  })

  it('an empty query matches everything', () => {
    expect(fuzzyMatch('', 'なんでも')).toEqual({ score: 0, ranges: [] })
  })

  it('returns match positions and can split for highlighting', () => {
    const m = fuzzyMatch('doc', 'doc 生成')!
    expect(m.ranges).toEqual([[0, 3]])
    expect(splitByRanges('doc 生成', m.ranges)).toEqual([
      { text: 'doc', hit: true },
      { text: ' 生成', hit: false }
    ])
  })
})
