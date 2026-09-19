/**
 * Fuzzy matching for the command palette.
 *
 * Requires every whitespace-separated term to be present (AND), and scores each term by
 * subsequence match. Japanese has no word boundaries, so contiguity and a prefix match are
 * the main sources of score.
 */

export interface FuzzyMatch {
  score: number
  /** The matched character positions (for highlighting; ascending, non-overlapping). */
  ranges: Array<[number, number]>
}

const BOUNDARY = /[\s/\-_.:()[\]{}「」（）・]/

/** Subsequence match for one term. */
function matchTerm(term: string, text: string): FuzzyMatch | null {
  const t = text.toLowerCase()
  const q = term.toLowerCase()
  if (q.length === 0) return { score: 0, ranges: [] }

  let score = 0
  let from = 0
  const hits: number[] = []

  for (let i = 0; i < q.length; i++) {
    const at = t.indexOf(q[i], from)
    if (at < 0) return null

    if (at === 0) score += 12
    else if (BOUNDARY.test(t[at - 1])) score += 8
    if (hits.length > 0 && at === hits[hits.length - 1] + 1) score += 10
    else score -= Math.min(6, at - from)

    hits.push(at)
    from = at + 1
  }

  // Strongly favor the whole term appearing contiguously
  if (t.includes(q)) score += 24 + (t.startsWith(q) ? 16 : 0)

  return { score, ranges: toRanges(hits) }
}

function toRanges(indices: number[]): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  for (const i of indices) {
    const last = ranges[ranges.length - 1]
    if (last && last[1] === i) last[1] = i + 1
    else ranges.push([i, i + 1])
  }
  return ranges
}

export function fuzzyMatch(query: string, text: string): FuzzyMatch | null {
  const terms = query.trim().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return { score: 0, ranges: [] }

  let score = 0
  const all: Array<[number, number]> = []

  for (const term of terms) {
    const m = matchTerm(term, text)
    if (!m) return null
    score += m.score
    all.push(...m.ranges)
  }

  // A shorter target means the query "named it" more exactly, so favor it slightly
  score -= Math.min(10, Math.floor(text.length / 12))

  return { score, ranges: mergeRanges(all) }
}

function mergeRanges(ranges: Array<[number, number]>): Array<[number, number]> {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0])
  const out: Array<[number, number]> = []
  for (const r of sorted) {
    const last = out[out.length - 1]
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1])
    else out.push([r[0], r[1]])
  }
  return out
}

/** Split into matched and unmatched pieces, for highlighting. */
export function splitByRanges(
  text: string,
  ranges: Array<[number, number]>
): Array<{ text: string; hit: boolean }> {
  if (ranges.length === 0) return [{ text, hit: false }]
  const parts: Array<{ text: string; hit: boolean }> = []
  let cursor = 0
  for (const [start, end] of ranges) {
    if (start > cursor) parts.push({ text: text.slice(cursor, start), hit: false })
    parts.push({ text: text.slice(start, end), hit: true })
    cursor = end
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), hit: false })
  return parts
}
