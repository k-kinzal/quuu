// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import type { SessionSnapshot } from '../src/main/session/types.js'
import { useStore } from '../src/renderer/src/state/store.js'

function snapshot(sessionId: string): SessionSnapshot {
  return { sessionId, exists: true, title: null, logPath: null, messages: [], hasMore: false, totalMessages: 0 }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(yes => { resolve = yes })
  return { promise, resolve }
}
afterEach(() => { vi.unstubAllGlobals(); useStore.setState({ selectedRunId: null, session: null, sessionLoading: false }) })

it('keeps the newest load when a task is reopened before its first request finishes', async () => {
  const first = deferred<SessionSnapshot>()
  const load = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce(snapshot('b')).mockResolvedValueOnce(snapshot('a-new'))
  vi.stubGlobal('quuu', { session: { load } })
  const old = useStore.getState().selectRun('a')
  await useStore.getState().selectRun('b')
  await useStore.getState().selectRun('a')
  first.resolve(snapshot('a-old'))
  await old
  expect(useStore.getState().session?.sessionId).toBe('a-new')
})

it('does not let an earlier-page response overwrite a newly selected task', async () => {
  const page = deferred<SessionSnapshot>()
  vi.stubGlobal('quuu', { session: { load: vi.fn().mockResolvedValueOnce(snapshot('a')).mockResolvedValueOnce(snapshot('b')), loadMore: () => page.promise } })
  await useStore.getState().selectRun('a')
  const old = useStore.getState().loadMoreSession()
  await useStore.getState().selectRun('b')
  page.resolve(snapshot('a-history'))
  await old
  expect(useStore.getState().session?.sessionId).toBe('b')
})
