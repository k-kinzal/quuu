// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The add target is memory for "keep adding to the same place".
 * Both surfaces that add (the list's one-line input, the bottom composer)
 * get unmounted, so it lives in the store — guaranteeing it **survives
 * moving between screens and reopening the window**.
 *
 * jsdom has no localStorage (Node's unimplemented one shows through), so we
 * swap in just the storage and check what was written reads back on the next boot.
 */
function fakeStorage(): Storage {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
      return values.size
    }
  }
}

describe('remembering the chosen add target', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', fakeStorage())
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('remembers nothing while nothing is chosen (it leaves that to the default rule)', async () => {
    const { useStore } = await import('../src/renderer/src/state/store.js')
    expect(useStore.getState().targetProjectId).toBeNull()
  })

  it('keeps a chosen destination across reopening the window', async () => {
    const first = await import('../src/renderer/src/state/store.js')
    first.useStore.getState().setTargetProject('p2')
    expect(first.useStore.getState().targetProjectId).toBe('p2')

    // Relaunch (the store is rebuilt while the saved data stays)
    vi.resetModules()
    const again = await import('../src/renderer/src/state/store.js')
    expect(again.useStore.getState().targetProjectId).toBe('p2')
  })

  it('does not forget it when moving between sections (a destination does not belong to a section)', async () => {
    const { useStore } = await import('../src/renderer/src/state/store.js')
    useStore.getState().setTargetProject('p2')
    useStore.getState().setSection({ kind: 'review' })
    useStore.getState().setSection({ kind: 'all' })
    expect(useStore.getState().targetProjectId).toBe('p2')
  })

  it('remembers it for as long as that window stays open even when the store is unusable', async () => {
    vi.stubGlobal('localStorage', undefined)
    vi.resetModules()
    const { useStore } = await import('../src/renderer/src/state/store.js')
    useStore.getState().setTargetProject('p2')
    expect(useStore.getState().targetProjectId).toBe('p2')
  })
})
