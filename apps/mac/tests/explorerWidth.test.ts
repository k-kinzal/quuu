// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })

it('restores explorer preferences after a restart and bounds invalid saved widths', async () => {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => key === 'taskd.layout.v8' ? JSON.stringify({
      rail: 208, explorers: { tree: 180, changes: 380, commits: -100, 'pull-requests': 'broken', projectFiles: 900 }
    }) : null
  })
  vi.resetModules()
  const { useStore } = await import('../src/renderer/src/state/store.js')
  expect(useStore.getState().layout.explorers).toEqual({
    tree: 180, changes: 380, commits: 120, 'pull-requests': 256, projectFiles: 640
  })
  expect(useStore.getState().layout.rail).toBe(208)
})
