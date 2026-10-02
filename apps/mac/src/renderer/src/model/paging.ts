/**
 * How many rows the Done section adds each time the reader nears the end of what is loaded.
 *
 * Done is the one list that only ever grows. Drawing all of it at once makes the section
 * slower to open every week, while the reason to open it is almost always something finished
 * recently.
 */
export const DONE_PAGE_SIZE = 50

/**
 * How many of `rows` are on screen, given how many have been loaded.
 *
 * **The highlighted row is always inside.** A task reached from elsewhere — the palette, a
 * notification, back — can sit past the loaded part. Left out, it is nowhere on screen and the
 * list moves the highlight back to the top, away from the task that was just asked for.
 */
export function loadedCount(rows: readonly { id: string }[], loaded: number, keepId: string | null): number {
  const keep = keepId === null ? -1 : rows.findIndex((row) => row.id === keepId)
  return Math.min(rows.length, Math.max(loaded, keep + 1))
}

/**
 * Whether the end of the scrolled content is close enough to load the next page.
 *
 * Within one more screenful, so the next rows are drawn before the reader reaches the edge
 * rather than after they have stopped there. A pane with no height (not laid out, collapsed) is
 * near nothing: measured as zero, it would pull in every page there is.
 */
export function nearEnd(metrics: { scrollTop: number; clientHeight: number; scrollHeight: number }): boolean {
  if (metrics.clientHeight <= 0) return false
  return metrics.scrollHeight - (metrics.scrollTop + metrics.clientHeight) <= metrics.clientHeight
}
