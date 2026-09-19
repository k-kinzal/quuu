import { describe, expect, it } from 'vitest'
import { rowOffsets, visibleRange } from '../src/renderer/src/model/windowing.js'

/** 100 rows of 30px. Their top positions are 0, 30, 60, ... 3000. */
const HEIGHTS: number[] = new Array<number>(100).fill(30)
const OFFSETS = rowOffsets(HEIGHTS)

describe('row positions', () => {
  it('makes the prefix sum one longer than the row count, ending at the total height', () => {
    expect(OFFSETS.length).toBe(101)
    expect(OFFSETS[0]).toBe(0)
    expect(OFFSETS[100]).toBe(3000)
  })

  it('stacks positions even with rows of differing height (a group header is 34px)', () => {
    expect(rowOffsets([34, 30, 30, 34, 30])).toEqual([0, 34, 64, 94, 128, 158])
  })
})

describe('the range that gets drawn', () => {
  it('draws only the rows that fit the surface plus the overscan at the top', () => {
    const range = visibleRange(OFFSETS, 0, 300, 10)
    expect(range.start).toBe(0)
    // 10 rows fit the surface -> 1 boundary row + 10 rows of overscan
    expect(range.end).toBe(21)
    expect(range.padTop).toBe(0)
    expect(range.padBottom).toBe(3000 - 21 * 30)
  })

  it('lets the spacers above and below take up the height it did not draw (the total stays the full height)', () => {
    const range = visibleRange(OFFSETS, 1500, 300, 10)
    const drawn = (range.end - range.start) * 30
    expect(range.padTop + drawn + range.padBottom).toBe(3000)
  })

  it('brings the rows at the scrolled position into range', () => {
    const range = visibleRange(OFFSETS, 1500, 300, 0)
    expect(range.start).toBe(50)
    expect(range.end).toBe(61)
  })

  it('puts the overscan both above and below', () => {
    const range = visibleRange(OFFSETS, 1500, 300, 5)
    expect(range.start).toBe(45)
    expect(range.end).toBe(66)
  })

  it('never goes before the top or past the bottom', () => {
    expect(visibleRange(OFFSETS, -800, 300, 10).start).toBe(0)
    const bottom = visibleRange(OFFSETS, 99_999, 300, 10)
    expect(bottom.end).toBe(100)
    expect(bottom.padBottom).toBe(0)
  })

  it('draws everything before the surface height is known (never show an empty table)', () => {
    const range = visibleRange(OFFSETS, 0, 0)
    expect(range).toEqual({ start: 0, end: 100, padTop: 0, padBottom: 0 })
  })

  it('draws nothing when there are no rows', () => {
    expect(visibleRange(rowOffsets([]), 0, 300)).toEqual({
      start: 0,
      end: 0,
      padTop: 0,
      padBottom: 0
    })
  })

  it('draws everything when it all fits the surface', () => {
    const short = rowOffsets(new Array<number>(5).fill(30))
    const range = visibleRange(short, 0, 600, 10)
    expect(range).toEqual({ start: 0, end: 5, padTop: 0, padBottom: 0 })
  })
})
