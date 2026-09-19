/**
 * The math for drawing **only the part of a long list that fits on screen**.
 *
 * At 1,800 rows the DOM passes 35,000 elements. Every sort or filter rebuilt all of them,
 * so a single action took over 2 seconds (measured).
 * Limiting drawing to what is visible keeps actions equally fast however many rows there are.
 *
 * Nothing here touches the DOM. It is **position math only**, so it can be checked
 * (`tests/windowing.test.ts`).
 */

export interface VisibleRange {
  /** The index to start drawing at */
  start: number
  /** The index to stop drawing at (exclusive) */
  end: number
  /** The height not drawn above */
  padTop: number
  /** The height not drawn below */
  padBottom: number
}

/**
 * The top position of each row (a prefix sum). Its length is `heights.length + 1`, and the
 * last element is the total height.
 */
export function rowOffsets(heights: number[]): number[] {
  const offsets = new Array<number>(heights.length + 1)
  offsets[0] = 0
  for (let i = 0; i < heights.length; i++) offsets[i + 1] = offsets[i] + heights[i]
  return offsets
}

/** The index of the row in `offsets` that contains that position. */
function indexAt(offsets: number[], position: number): number {
  let lo = 0
  let hi = offsets.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (offsets[mid + 1] <= position) lo = mid + 1
    else hi = mid
  }
  return lo
}

/**
 * The range to draw right now.
 *
 * `overscan` is how many extra rows to draw beyond the viewport — margin so no white band
 * shows through the gap between scrolling and painting. At 0, a fast scroll drops the bottom edge.
 *
 * When the heights aren't settled (no rows, or nothing measured yet), draw everything.
 * "Nothing measured yet, so draw nothing" shows an empty table on first paint.
 */
export function visibleRange(
  offsets: number[],
  scrollTop: number,
  viewportHeight: number,
  overscan = 10
): VisibleRange {
  const count = offsets.length - 1
  const total = offsets[count] ?? 0
  if (count === 0) return { start: 0, end: 0, padTop: 0, padBottom: 0 }
  if (viewportHeight <= 0) return { start: 0, end: count, padTop: 0, padBottom: 0 }

  const top = Math.max(0, Math.min(scrollTop, Math.max(0, total - viewportHeight)))
  const first = indexAt(offsets, top)
  const last = indexAt(offsets, top + viewportHeight)

  const start = Math.max(0, first - overscan)
  const end = Math.min(count, last + 1 + overscan)

  return {
    start,
    end,
    padTop: offsets[start],
    padBottom: total - offsets[end]
  }
}
