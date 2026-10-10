/** Unknown extension entries and malformed JSON must not interrupt the session reader. */
export function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function record(line: string): Record<string, unknown> {
  try { return object(JSON.parse(line)) } catch { return {} }
}

export function timestamp(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}
