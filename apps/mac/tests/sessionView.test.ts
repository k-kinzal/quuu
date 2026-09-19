import { describe, expect, it } from 'vitest'
import type { ToolCall } from '../src/main/session/types.js'
import { resultLanguage } from '../src/renderer/src/model/session.js'

/**
 * Which language a tool result gets colored as.
 *
 * A result mixes "a file that was read", "the output of a run" and "a diff".
 * Which one it is follows from the tool and the content, so the reader is never made to work it out.
 */

function tool(patch: Partial<ToolCall>): ToolCall {
  return {
    id: 't1',
    name: 'Bash',
    input: {},
    target: null,
    result: null,
    isError: false,
    images: [],
    ...patch
  }
}

describe('coloring a result', () => {
  it('decides a file that was read by its extension', () => {
    expect(resultLanguage(tool({ name: 'Read', input: { file_path: '/a/b/x.ts' }, result: 'x' }))).toBe('ts')
    expect(resultLanguage(tool({ name: 'Read', input: { file_path: '/a/b/x.PY' }, result: 'x' }))).toBe('python')
    expect(resultLanguage(tool({ name: 'Read', input: { file_path: '/a/b/README' }, result: 'x' }))).toBe('')
  })

  it('reads a diff as a diff whichever tool produced it', () => {
    const result = 'diff --git a/x b/x\n@@ -1 +1 @@\n-古い\n+新しい'
    expect(resultLanguage(tool({ name: 'Bash', input: { command: 'git diff' }, result }))).toBe('diff')
  })

  it('does not color the output of a run (there is no telling what it is)', () => {
    expect(resultLanguage(tool({ name: 'Bash', result: 'ok\n3 passed' }))).toBe('')
    expect(resultLanguage(tool({ name: 'Grep', input: { pattern: 'x' }, result: 'a.ts:1:x' }))).toBe('')
  })

  it('says nothing about a result that is not there yet', () => {
    expect(resultLanguage(tool({ name: 'Read', input: { file_path: 'x.ts' } }))).toBe('ts')
    expect(resultLanguage(tool({ name: 'Bash' }))).toBe('')
  })
})
