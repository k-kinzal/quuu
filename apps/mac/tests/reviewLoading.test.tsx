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

afterEach(() => { cleanup(); queryClient.clear(); vi.useRealTimers(); vi.unstubAllGlobals() })

it('does not carry loading over when moving to another task mid-fetch, and does not show the old successful result', async () => {
  const first = deferred<ReviewSnapshot>()
  const second = deferred<ReviewSnapshot>()
  const read = vi.fn<(taskId: string) => Promise<ReviewSnapshot>>().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
  vi.stubGlobal('quuu', { review: { poll: ({ taskId }: { taskId: string }) => read(taskId).then((snapshot: ReviewSnapshot) => ({ version: taskId, snapshot })), refresh: read } })
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
  const read = vi.fn<(taskId: string) => Promise<ReviewSnapshot>>().mockReturnValueOnce(first.promise).mockResolvedValueOnce(snapshot('second'))
  vi.stubGlobal('quuu', { review: { poll: ({ taskId }: { taskId: string }) => read(taskId).then((snapshot: ReviewSnapshot) => ({ version: taskId, snapshot })), refresh: read } })
  const { result, rerender } = renderHook(({ taskId }) => useReviewSnapshot(taskId, true), { initialProps: { taskId: 'first' } })
  rerender({ taskId: 'second' })
  await waitFor(() => expect(result.current.snapshot?.cwd).toBe('second'))
  await act(async () => { first.reject(new Error('old error')); await first.promise.catch(() => undefined) })
  expect(result.current.error).toBeNull()
  await waitFor(() => expect(result.current.snapshot?.cwd).toBe('second'))
})

it('does not hammer a failed fetch automatically, and refetches on an explicit refresh', async () => {
  const read = vi.fn<(taskId: string) => Promise<ReviewSnapshot>>().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(snapshot('ready'))
  vi.stubGlobal('quuu', { review: { poll: ({ taskId }: { taskId: string }) => read(taskId).then((snapshot: ReviewSnapshot) => ({ version: taskId, snapshot })), refresh: read } })
  const { result, rerender } = renderHook(() => useReviewSnapshot('task', true))
  await waitFor(() => expect(result.current.error).toBe('offline'))
  rerender()
  expect(read).toHaveBeenCalledTimes(1)
  await act(async () => { await result.current.refresh() })
  await waitFor(() => expect(result.current.snapshot?.cwd).toBe('ready'))
  expect(result.current.error).toBeNull()
})

it('polls at the same cadence while reusing unchanged reviews, and reads the next version', async () => {
  vi.useFakeTimers()
  const initial = snapshot('first')
  const changed = snapshot('updated')
  const poll = vi.fn().mockResolvedValueOnce({ version: 'v1', snapshot: initial })
    .mockResolvedValueOnce({ version: 'v1', snapshot: null })
    .mockResolvedValueOnce({ version: 'v2', snapshot: changed })
  vi.stubGlobal('quuu', { review: { poll } })
  const { result } = renderHook(() => useReviewSnapshot('task', true))
  await act(async () => { await vi.advanceTimersByTimeAsync(10) })
  const first = result.current.snapshot
  expect(first).toEqual(initial)
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  expect(poll).toHaveBeenLastCalledWith({ taskId: 'task', knownVersion: 'v1' })
  expect(result.current.snapshot).toBe(first)
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  expect(result.current.snapshot).toEqual(changed)
})

it('does not let an older poll overwrite an explicit refresh', async () => {
  const pending = deferred<{ version: string; snapshot: ReviewSnapshot }>()
  const poll = vi.fn().mockReturnValue(pending.promise)
  const refresh = vi.fn().mockResolvedValue(snapshot('fresh'))
  vi.stubGlobal('quuu', { review: { poll, refresh } })
  const { result } = renderHook(() => useReviewSnapshot('task', true))
  await act(async () => { await result.current.refresh() })
  await waitFor(() => expect(result.current.snapshot?.cwd).toBe('fresh'))
  await act(async () => { pending.resolve({ version: 'old', snapshot: snapshot('old') }); await pending.promise })
  expect(result.current.snapshot?.cwd).toBe('fresh')
})

it('does not let a poll started during a slow refresh restore an earlier projection', async () => {
  vi.useFakeTimers()
  const pendingPoll = deferred<{ version: string; snapshot: ReviewSnapshot }>()
  const pendingRefresh = deferred<ReviewSnapshot>()
  const poll = vi.fn().mockResolvedValueOnce({ version: 'old', snapshot: snapshot('old') })
    .mockReturnValue(pendingPoll.promise)
  vi.stubGlobal('quuu', { review: { poll, refresh: () => pendingRefresh.promise } })
  const { result } = renderHook(() => useReviewSnapshot('task', true))
  await act(async () => { await vi.advanceTimersByTimeAsync(10) })
  let refreshed!: Promise<void>
  await act(async () => { refreshed = result.current.refresh(); await vi.advanceTimersByTimeAsync(10) })
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  expect(poll).toHaveBeenCalledTimes(2)
  await act(async () => { pendingRefresh.resolve(snapshot('fresh')); await refreshed; await vi.advanceTimersByTimeAsync(10) })
  await act(async () => { pendingPoll.resolve({ version: 'old', snapshot: snapshot('old') }); await pendingPoll.promise })
  expect(result.current.snapshot?.cwd).toBe('fresh')
})
