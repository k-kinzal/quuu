import { describe, expect, it } from 'vitest'
import { operationNames } from '../src/api/generated/operations.js'
import { QuuuApp } from '../src/main/bootstrap.js'

/**
 * What only the app menu could do - the version, where the data lives, "Check for Updates…" -
 * reaches the CLI and MCP as operations of their own, without needing a window.
 */
describe('the app menu as operations', () => {
  it('are part of the contract every client is generated from', () => {
    expect(operationNames).toEqual(expect.arrayContaining(['app.info', 'app.checkForUpdates']))
  })

  it('answer with what the desktop entry handed in', () => {
    const app = new QuuuApp(':memory:')
    app.scheduler.pause()
    let checked = 0
    const info = { version: '2026.9.28', dataDirectory: '/tmp/quuu', updates: 'idle' as const }
    app.setAppControls({ info: () => info, checkForUpdates: () => { checked++; return { ...info, updates: 'checking' } } })

    expect(app.appControls().info()).toEqual(info)
    expect(app.appControls().checkForUpdates().updates).toBe('checking')
    expect(checked).toBe(1)
  })

  it('say so instead of inventing values outside the desktop app', () => {
    const app = new QuuuApp(':memory:')
    app.scheduler.pause()
    expect(() => app.appControls()).toThrow(/desktop app/)
  })
})
