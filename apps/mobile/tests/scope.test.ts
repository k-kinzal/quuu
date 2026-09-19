import { TASK_STATUSES } from '../src/sync/task.js'
import { TASK_STATUS_LABEL } from '../src/model/labels.js'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ALL_TASKS, TASK_SCOPES, inScope, sameScope, scopeLabel } from '../src/model/scope.js'

/**
 * **Vocabulary is decided in exactly one place.**
 *
 * The iPhone screens once coined words this product does not have for states it
 * already names. When the Mac says Queued and Running and the phone says something of
 * its own for the same thing, people cannot tell they are looking at one product.
 * This check exists to catch that happening again.
 */

describe('the list scopes', () => {
  it('uses the same words as the Mac rail', () => {
    expect(scopeLabel({ kind: 'all' })).toBe('All tasks')
    expect(scopeLabel({ kind: 'review' })).toBe('Needs review')
  })

  it('a status scope uses the status word verbatim, never a paraphrase', () => {
    for (const status of TASK_STATUSES) {
      expect(scopeLabel({ kind: 'status', status })).toBe(TASK_STATUS_LABEL[status])
    }
  })

  it('the scopes are exactly All tasks, Needs review, and the 7 statuses', () => {
    expect(TASK_SCOPES).toHaveLength(2 + TASK_STATUSES.length)
  })

  it('All tasks excludes Done, the same as the Mac rail', () => {
    expect(inScope(ALL_TASKS, 'queued')).toBe(true)
    expect(inScope(ALL_TASKS, 'review')).toBe(true)
    expect(inScope(ALL_TASKS, 'done')).toBe(false)
  })

  it('Needs review holds only what sits at the stage a human reads and decides', () => {
    const review = { kind: 'review' } as const
    expect(inScope(review, 'review')).toBe(true)
    expect(inScope(review, 'failed')).toBe(true)
    expect(inScope(review, 'running')).toBe(false)
    expect(inScope(review, 'done')).toBe(false)
  })

  it('a status scope admits only that status', () => {
    for (const status of TASK_STATUSES) {
      const scope = { kind: 'status', status } as const
      for (const other of TASK_STATUSES) {
        expect(inScope(scope, other), `${status} / ${other}`).toBe(status === other)
      }
    }
  })

  it('can tell whether two scopes are the same, which decides where the mark goes', () => {
    expect(sameScope(ALL_TASKS, { kind: 'all' })).toBe(true)
    expect(sameScope(ALL_TASKS, { kind: 'review' })).toBe(false)
    expect(sameScope({ kind: 'status', status: 'done' }, { kind: 'status', status: 'done' })).toBe(
      true
    )
    expect(sameScope({ kind: 'status', status: 'done' }, { kind: 'status', status: 'draft' })).toBe(
      false
    )
  })
})

/**
 * Whether the screens have invented vocabulary.
 *
 * It inspects **the string literals themselves**, not behavior. Types cannot pin this
 * down: plausible-sounding wording is always writable.
 */
describe('the screens have invented no vocabulary', () => {
  // Japanese guards the ja resources; English guards the en resources and the screens.
  // Both faces of the same invention
  const banned = [
    '動いている',
    '未完了',
    'すべて見る',
    'アクティブ',
    '進行中',
    'active',
    'in progress',
    'incomplete',
    'unfinished',
    'see all',
    'view all'
  ]

  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) return sources(path)
      return /\.tsx?$/.test(name) ? [path] : []
    })
  }

  it('no paraphrase outside this product vocabulary appears on the iPhone screens', () => {
    const root = join(import.meta.dirname, '..', 'src')
    for (const file of sources(root)) {
      const text = readFileSync(file, 'utf8')
      for (const word of banned) {
        // Writing "never do this" in a comment is allowed. Only text that reaches the
        // screen matters, so this is limited to what sits inside quotes. English uses
        // word boundaries so partial matches like "interactive" are not caught, and
        // case is ignored as mere spelling variation
        const pattern = /^[a-z]/.test(word) ? `\\b${word}\\b` : word
        expect(text, `${file} contains "${word}"`).not.toMatch(
          new RegExp(`['"\`][^'"\`\\n]*${pattern}`, 'i')
        )
      }
    }
  })
})
