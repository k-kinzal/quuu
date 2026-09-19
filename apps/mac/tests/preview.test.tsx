// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import { usePreview } from '../src/renderer/src/interaction/usePreview.js'

it('does not show a stale reply once the input changes, and tells the latest rejection apart from an empty value', async () => {
  let finishOld!: (value: string) => void
  let finishNew!: (value: string) => void
  let rejectLatest!: (reason: Error) => void
  const requests = [
    new Promise<string>(resolve => { finishOld = resolve }),
    new Promise<string>(resolve => { finishNew = resolve }),
    new Promise<string>((_resolve, reject) => { rejectLatest = reject })
  ]
  const { result, rerender, unmount } = renderHook(({ index }) => usePreview(String(index), () => requests[index]), { initialProps: { index: 0 } })
  await act(async () => { await Promise.resolve() })
  rerender({ index: 1 })
  expect(result.current.value).toBeNull()
  await act(async () => { finishNew('最新のプレビュー'); await requests[1] })
  expect(result.current.value).toBe('最新のプレビュー')
  await act(async () => { finishOld('古いプレビュー'); await requests[0] })
  expect(result.current.value).toBe('最新のプレビュー')
  rerender({ index: 2 })
  await act(async () => { await Promise.resolve(); rejectLatest(new Error('cannot read the input')) })
  expect(result.current.value).toBeNull()
  expect(result.current.error).toContain('cannot read the input')
  unmount()
})
