/**
 * Path display.
 *
 * Printing `/Users/me/Projects/ai-toolkit/tests/Unit/DocGen/Render/AssetPublisherTest.php`
 * verbatim on every row spends most of the width on "a prefix that is obvious once you know
 * the project", and the file name you need to identify it is the first thing cut. That is
 * cutting data-ink to keep non-data ink, so: drop the prefix, always keep the tail.
 */

/** Make it relative to the project root. */
export function relativeToCwd(path: string, cwd: string | null | undefined): string {
  if (!cwd) return path
  if (path === cwd) return '.'
  const root = cwd.endsWith('/') ? cwd : `${cwd}/`
  return path.startsWith(root) ? path.slice(root.length) : path
}

/**
 * Shorten a long path. Always keep the file name (the identifier); elide the middle directories.
 * `tests/Unit/DocGen/Render/AssetPublisherTest.php` → `tests/…/AssetPublisherTest.php`
 */
export function compactPath(path: string, max = 46): string {
  if (path.length <= max) return path

  const segments = path.split('/')
  const file = segments[segments.length - 1]

  // When the file name alone overflows, keep the extension and elide the middle
  if (file.length >= max) return middleTruncate(file, max)

  for (let keep = segments.length - 2; keep >= 1; keep--) {
    const candidate = `${segments.slice(0, keep).join('/')}/…/${file}`
    if (candidate.length <= max) return candidate
  }
  return `…/${file}`
}

export function middleTruncate(text: string, max: number): string {
  if (text.length <= max) return text
  const head = Math.ceil((max - 1) / 2)
  const tail = Math.floor((max - 1) / 2)
  return `${text.slice(0, head)}…${text.slice(text.length - tail)}`
}

/** Take just the file name. */
export function basename(path: string): string {
  const segments = path.split('/')
  return segments[segments.length - 1] || path
}

/** Shrink a command to one line. Newlines and heredocs are folded away. */
export function compactCommand(command: string, max = 64): string {
  const single = command.replace(/\s+/g, ' ').trim()
  return single.length <= max ? single : `${single.slice(0, max - 1)}…`
}
