import type { FileChangeKind, ReviewChange } from './types.js'

function changeKind(code: string): FileChangeKind {
  if (code.includes('U') || code === 'AA' || code === 'DD') return 'conflicted'
  const value = code.trim().charAt(0)
  if (value === 'A') return 'added'
  if (value === 'D') return 'deleted'
  if (value === 'R') return 'renamed'
  if (value === 'C') return 'copied'
  if (value === '?') return 'untracked'
  return 'modified'
}

export function parseStatusEntries(raw: string): ReviewChange[] {
  const values = raw.split('\0')
  const result: ReviewChange[] = []
  for (let index = 0; index < values.length; index += 1) {
    const record = values[index]
    if (!record || record.length < 4) continue
    const code = record.slice(0, 2)
    const path = record.slice(3)
    if (code.includes('R') || code.includes('C')) {
      // porcelain -z reverses the usual display: "after NUL before". The tree shows the after.
      const previousPath = values[index + 1]
      if (previousPath) {
        result.push({ path, change: changeKind(code), previousPath })
        index += 1
        continue
      }
    }
    result.push({ path, change: changeKind(code) })
  }
  return result.sort((a, b) => a.path.localeCompare(b.path))
}

export function parseNameStatus(raw: string): ReviewChange[] {
  const values = raw.split('\0').filter(Boolean)
  const result: ReviewChange[] = []
  for (let index = 0; index < values.length; index += 2) {
    const code = values[index] ?? ''
    let path = values[index + 1] ?? ''
    let previousPath: string | undefined
    if ((code.startsWith('R') || code.startsWith('C')) && values[index + 2]) {
      previousPath = path
      path = values[index + 2]
      index += 1
    }
    if (path) result.push({ path, change: changeKind(code), previousPath })
  }
  return result
}

