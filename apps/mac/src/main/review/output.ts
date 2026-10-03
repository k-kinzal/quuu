/**
 * Decode result envelopes, not the program that printed them. In particular, a
 * Codex exec can print several JSON values and a later wait can print its stdout.
 * Names, display targets, input code and relative ordering cannot establish which
 * command produced that output. These strings are observations, never ownership.
 */
export function resultStrings(output: string, successfulOnly = false): string[] {
  const strings: string[] = []
  const visit = (value: unknown, depth: number): void => {
    // Provider output is untrusted and can be recursively JSON encoded.
    if (depth > 32) return
    if (typeof value === 'string') {
      try {
        const decoded: unknown = JSON.parse(value)
        if (typeof decoded === 'object' && decoded !== null || typeof decoded === 'string' && decoded !== value) {
          visit(decoded, depth + 1)
          return
        }
      } catch { /* Plain stdout and JSONL are both valid result bodies. */ }
      for (const line of value.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          try { visit(JSON.parse(trimmed) as unknown, depth + 1); continue }
          catch { /* A git commit receipt also starts with an opening bracket. */ }
        }
        strings.push(line)
      }
    } else if (Array.isArray(value)) {
      for (const child of value) visit(child, depth + 1)
    } else if (value && typeof value === 'object') {
      const fields = value as Record<string, unknown>
      if (successfulOnly && (fields.isError === true || fields.status === 'rejected' ||
        ['code', 'exit_code'].some(key => typeof fields[key] === 'number' && fields[key] !== 0))) return
      for (const [key, child] of Object.entries(fields)) {
        // Never scan echoed input, PR bodies, labels or other arbitrary metadata.
        if (['output', 'stdout', 'result', 'value', 'content', 'text', 'url', 'html_url'].includes(key)) visit(child, depth + 1)
      }
    }
  }
  visit(output, 0)
  return strings
}
