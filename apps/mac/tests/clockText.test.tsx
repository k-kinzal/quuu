// @vitest-environment jsdom
import { StrictMode } from 'react'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useClockText } from '../src/renderer/src/interaction/useClockText.js'
import { duration, relativeTime } from '../src/renderer/src/model/format.js'

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

it('keeps one clock and renders only labels whose displayed value changed', () => {
  vi.useFakeTimers()
  const start = new Date('2026-10-02T12:00:00Z')
  vi.setSystemTime(start.getTime() + 120_000)
  let relativeRenders = 0
  const fixed = renderHook(() => { relativeRenders++; return useClockText(now => relativeTime(start.toISOString(), now)) })
  const running = renderHook(() => useClockText(now => duration(start.toISOString(), null, now)))
  const before = fixed.result.current
  const elapsed = running.result.current
  const renders = relativeRenders
  expect(vi.getTimerCount()).toBe(1)
  act(() => { vi.advanceTimersByTime(1000) })
  expect(fixed.result.current).toBe(before)
  expect(relativeRenders).toBe(renders)
  expect(running.result.current).not.toBe(elapsed)
  act(() => { vi.advanceTimersByTime(59_000) })
  expect(fixed.result.current).not.toBe(before)
  fixed.unmount()
  running.unmount()
  expect(vi.getTimerCount()).toBe(0)
})

it('stops in hidden documents and immediately catches up on return', () => {
  vi.useFakeTimers()
  vi.setSystemTime(10_000)
  let hidden = false
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden)
  const { result, unmount } = renderHook(() => useClockText(now => String(now)), { wrapper: StrictMode })
  expect(result.current).toBe('10000')
  act(() => { hidden = true; document.dispatchEvent(new Event('visibilitychange')) })
  expect(vi.getTimerCount()).toBe(0)
  act(() => { vi.advanceTimersByTime(30_000) })
  expect(result.current).toBe('10000')
  act(() => { hidden = false; document.dispatchEvent(new Event('visibilitychange')) })
  expect(result.current).toBe('40000')
  expect(vi.getTimerCount()).toBe(1)
  unmount()
  expect(vi.getTimerCount()).toBe(0)
})

it('updates changed inputs immediately and releases the clock when a run finishes', () => {
  vi.useFakeTimers()
  vi.setSystemTime(20_000)
  const { result, rerender } = renderHook(({ end }) => useClockText(now => String(end ?? now), end === null),
    { initialProps: { end: null as number | null } })
  expect(result.current).toBe('20000')
  rerender({ end: 19_000 })
  expect(result.current).toBe('19000')
  expect(vi.getTimerCount()).toBe(0)
  act(() => { vi.advanceTimersByTime(5000) })
  rerender({ end: null })
  expect(result.current).toBe('25000')
  expect(vi.getTimerCount()).toBe(1)
})
