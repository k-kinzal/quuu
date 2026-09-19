// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ReviewSnapshot } from '../src/main/review/types.js'
import { queryClient } from '../src/renderer/src/state/queryClient.js'
import { useReviewSnapshot } from '../src/renderer/src/interaction/useReviewSnapshot.js'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function snapshot(cwd: string): ReviewSnapshot {
  return { cwd, branch: 'main', repository: null, tree: [], changes: [], stagedChanges: [], stagedRevision: null, localChanges: [], revision: null, localRevision: null, commits: [], pullRequests: [], coverage: null, projectTasks: [] }
}

afterEach(() => { cleanup(); queryClient.clear(); vi.unstubAllGlobals() })

it('does not carry loading over when moving to another task mid-fetch, and does not show the old successful result', async () => {
  const first = deferred<ReviewSnapshot>()
  const second = deferred<ReviewSnapshot>()
  const read = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
  vi.stubGlobal('quuu', { review: { snapshot: read, refresh: read } })
  const { result, rerender } = renderHook(({ taskId }) => useReviewSnapshot(taskId, true), { initialProps: { taskId: 'first' } })
  expect(result.current.loading).toBe(true)
  rerender({ taskId: 'second' })
  await waitFor(() => expect(read).toHaveBeenCalledWith('second'))
  await act(async () => { second.resolve(snapshot('second')); await second.promise })
  await waitFor(() => expect(result.current.snapshot?.cwd).toBe('second'))
  await act(async () => { first.resolve(snapshot('first')); await first.promise })
  await waitFor(() => expect(result.current.snapshot?.cwd).toBe('second'))
  expect(result.current.loading).toBe(false)
})

it('does not let a fetch failure of the previous task overwrite the result of the new one', async () => {
  const first = deferred<ReviewSnapshot>()
  const read = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce(snapshot('second'))
  vi.stubGlobal('quuu', { review: { snapshot: read, refresh: read } })
  const { result, rerender } = renderHook(({ taskId }) => useReviewSnapshot(taskId, true), { initialProps: { taskId: 'first' } })
  rerender({ taskId: 'second' })
  await waitFor(() => expect(result.current.snapshot?.cwd).toBe('second'))
  await act(async () => { first.reject(new Error('old error')); await first.promise.catch(() => undefined) })
  expect(result.current.error).toBeNull()
  await waitFor(() => expect(result.current.snapshot?.cwd).toBe('second'))
})

it('does not hammer a failed fetch automatically, and refetches on an explicit refresh', async () => {
  const read = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(snapshot('ready'))
  vi.stubGlobal('quuu', { review: { snapshot: read, refresh: read } })
  const { result, rerender } = renderHook(() => useReviewSnapshot('task', true))
  await waitFor(() => expect(result.current.error).toBe('offline'))
  rerender()
  expect(read).toHaveBeenCalledTimes(1)
  await act(async () => { await result.current.refresh() })
  await waitFor(() => expect(result.current.snapshot?.cwd).toBe('ready'))
  expect(result.current.error).toBeNull()
})
