import { EventEmitter } from 'node:events'
import type { BrowserWindow } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  cookies: [] as Array<{ name: string; value: string }>,
  partitions: [] as string[],
  windows: [] as Array<EventEmitter & { options: Record<string, unknown>; loadURL: ReturnType<typeof vi.fn>; webContents: EventEmitter }>,
  flush: vi.fn(),
  clearStorageData: vi.fn(),
  clearCache: vi.fn(),
  permissions: vi.fn()
}))

vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  class BrowserWindow extends EventEmitter {
    destroyed = false
    readonly loadURL = vi.fn().mockResolvedValue(undefined)
    readonly webContents = Object.assign(new EventEmitter(), {
      loadURL: vi.fn().mockResolvedValue(undefined), setWindowOpenHandler: vi.fn()
    })
    constructor(readonly options: Record<string, unknown>) {
      super()
      state.windows.push(this)
    }
    isDestroyed(): boolean { return this.destroyed }
    show(): void {}
    focus(): void {}
    close(): void {
      this.destroyed = true
      this.emit('closed')
    }
  }
  return {
    BrowserWindow,
    app: { isPackaged: true }, clipboard: { writeText: vi.fn() }, shell: { openExternal: vi.fn() },
    Menu: { buildFromTemplate: () => ({ popup: vi.fn() }) },
    session: { fromPartition: (partition: string) => {
      state.partitions.push(partition)
      return {
        setPermissionRequestHandler: state.permissions,
        clearStorageData: state.clearStorageData.mockImplementation(() => { state.cookies = []; return Promise.resolve() }),
        clearCache: state.clearCache.mockResolvedValue(undefined),
        cookies: {
          get: () => Promise.resolve(state.cookies),
          flushStore: state.flush.mockResolvedValue(undefined)
        }
      }
    } }
  }
})

const { githubWebStatus, signInToGitHubWeb, signOutOfGitHubWeb } = await import('../src/main/platform/githubWeb.js')

const signedIn = [
  { name: 'logged_in', value: 'yes' },
  { name: 'user_session', value: 'secret' },
  { name: 'dotcom_user', value: 'octocat' }
]

beforeEach(() => {
  state.cookies = []
  state.windows.length = 0
  state.flush.mockClear()
})

describe('the sign-in the GitHub pages keep', () => {
  it('reads as signed in only while GitHub’s session cookie stands behind its marker', async () => {
    expect(await githubWebStatus()).toEqual({ signedIn: false, login: null })
    state.cookies = signedIn
    expect(await githubWebStatus()).toEqual({ signedIn: true, login: 'octocat' })
    // An expired session leaves the year-long marker behind; the page would show the sign-in form.
    state.cookies = signedIn.filter(cookie => cookie.name !== 'user_session')
    expect(await githubWebStatus()).toEqual({ signedIn: false, login: null })
    expect(state.partitions.every(partition => partition === 'persist:quuu-github')).toBe(true)
  })

  it('allows a page to copy and refuses everything else it might ask for', () => {
    const handler = state.permissions.mock.calls[0][0] as (contents: unknown, permission: string, callback: (allowed: boolean) => void) => void
    const answer = vi.fn()
    handler(null, 'clipboard-sanitized-write', answer)
    handler(null, 'notifications', answer)
    expect(answer.mock.calls).toEqual([[true], [false]])
  })

  it('opens GitHub’s own sign-in page, closes once GitHub let the person in, and saves the sign-in to disk', async () => {
    const owner = Object.assign(new EventEmitter(), { isDestroyed: () => false }) as unknown as BrowserWindow
    const done = signInToGitHubWeb(owner)
    const window = state.windows[0]
    expect(window.options).toMatchObject({ parent: owner, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } })
    expect(window.loadURL).toHaveBeenCalledWith('https://github.com/login')
    // A second request while the window is open brings the same window forward.
    expect(signInToGitHubWeb(owner)).toBe(done)
    expect(state.windows).toHaveLength(1)

    // Two-factor is still part of signing in, even with the session already set.
    state.cookies = signedIn
    window.webContents.emit('did-navigate', {}, 'https://github.com/sessions/two-factor/app')
    await new Promise(resolve => setTimeout(resolve, 0))
    expect((window as unknown as { destroyed: boolean }).destroyed).toBe(false)

    window.webContents.emit('did-navigate', {}, 'https://github.com/')
    expect(await done).toEqual({ signedIn: true, login: 'octocat' })
    expect(state.flush).toHaveBeenCalled()
  })

  it('answers the status as it stands when the person closes the window without signing in', async () => {
    const done = signInToGitHubWeb(null)
    state.windows[0].emit('closed')
    expect(await done).toEqual({ signedIn: false, login: null })
  })

  it('forgets the sign-in and what the pages kept when signing out', async () => {
    state.cookies = signedIn
    expect(await signOutOfGitHubWeb()).toEqual({ signedIn: false, login: null })
    expect(state.clearStorageData).toHaveBeenCalled()
    expect(state.clearCache).toHaveBeenCalled()
    expect(state.flush).toHaveBeenCalled()
  })
})
