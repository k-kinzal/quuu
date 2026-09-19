import { describe, expect, it, vi } from 'vitest'
import type { BrowserWindow, MenuItem, MenuItemConstructorOptions } from 'electron'
import type { EventEmitter } from 'node:events'
import { closePullRequestView, hidePullRequestView, showPullRequestView } from '../src/main/platform/pullRequestViews.js'

interface MockViewRecord {
  setBounds: ReturnType<typeof vi.fn>
  webContents: EventEmitter & {
    loadURL: ReturnType<typeof vi.fn>
    close: ReturnType<typeof vi.fn>
    isDestroyed(): boolean
    getURL: ReturnType<typeof vi.fn>
    focus: ReturnType<typeof vi.fn>
    copyImageAt: ReturnType<typeof vi.fn>
    reload: ReturnType<typeof vi.fn>
    navigationHistory: {
      canGoBack: ReturnType<typeof vi.fn>
      canGoForward: ReturnType<typeof vi.fn>
      goBack: ReturnType<typeof vi.fn>
      goForward: ReturnType<typeof vi.fn>
    }
  }
}

const electronState = vi.hoisted(() => ({
  views: [] as MockViewRecord[],
  template: [] as MenuItemConstructorOptions[],
  popup: vi.fn(), openExternal: vi.fn().mockResolvedValue(undefined), copy: vi.fn()
}))

vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  class WebContentsView {
    readonly setBounds = vi.fn()
    readonly webContents: MockViewRecord['webContents'] & {
      setWindowOpenHandler: ReturnType<typeof vi.fn>
    }

    constructor() {
      let destroyed = false
      this.webContents = Object.assign(new EventEmitter(), {
        loadURL: vi.fn().mockResolvedValue(undefined),
        setWindowOpenHandler: vi.fn(),
        getURL: vi.fn().mockReturnValue('https://github.com/openai/quuu/pull/42/files'),
        focus: vi.fn(), copyImageAt: vi.fn(), reload: vi.fn(),
        navigationHistory: {
          canGoBack: vi.fn().mockReturnValue(true), canGoForward: vi.fn().mockReturnValue(false),
          goBack: vi.fn(), goForward: vi.fn()
        },
        isDestroyed: () => destroyed,
        close: vi.fn(() => {
          destroyed = true
          this.webContents.emit('destroyed')
        })
      })
      electronState.views.push(this)
    }
  }

  return {
    BrowserWindow: class { }, WebContentsView,
    app: { isPackaged: true }, clipboard: { writeText: electronState.copy },
    shell: { openExternal: electronState.openExternal },
    Menu: { buildFromTemplate: (items: MenuItemConstructorOptions[]) => {
      electronState.template = items
      return { popup: electronState.popup }
    } }
  }
})

function owner(width = 1000, height = 700): {
  window: BrowserWindow
  add: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
} {
  const add = vi.fn()
  const remove = vi.fn()
  return {
    window: {
      getContentSize: () => [width, height],
      once: vi.fn(),
      isDestroyed: () => false,
      contentView: { addChildView: add, removeChildView: remove },
      webContents: { on: vi.fn() }
    } as unknown as BrowserWindow,
    add,
    remove
  }
}

describe('the embedded Pull Request view', () => {
  it('keeps the WebContents within the same tab, following only the display area and closing with it', () => {
    const target = owner()
    const first = showPullRequestView(target.window, {
      id: 'pr-42',
      url: 'https://github.com/openai/quuu/pull/42',
      bounds: { x: 300, y: 120, width: 900, height: 800 }
    })

    expect(first).toEqual({ ok: true })
    expect(electronState.views).toHaveLength(1)
    expect(target.add).toHaveBeenCalledOnce()
    expect(electronState.views[0].setBounds).toHaveBeenLastCalledWith({
      x: 300,
      y: 120,
      width: 700,
      height: 580
    })

    hidePullRequestView(target.window, 'pr-42')
    expect(target.remove).toHaveBeenCalledOnce()
    showPullRequestView(target.window, {
      id: 'pr-42',
      url: 'https://github.com/openai/quuu/pull/42',
      bounds: { x: 240, y: 100, width: 600, height: 500 }
    })
    expect(electronState.views).toHaveLength(1)
    expect(target.add).toHaveBeenCalledTimes(2)
    expect(electronState.views[0].webContents.loadURL).toHaveBeenCalledOnce()

    closePullRequestView(target.window, 'pr-42')
    expect(electronState.views[0].webContents.close).toHaveBeenCalledOnce()
  })

  it('refuses a URL that is not a GitHub Pull Request before creating a native view', () => {
    const before = electronState.views.length
    const result = showPullRequestView(owner().window, {
      id: 'outside',
      url: 'https://example.com/openai/quuu/pull/42',
      bounds: { x: 0, y: 0, width: 500, height: 500 }
    })

    expect(result).toEqual({ ok: false, reason: 'Only GitHub pull requests can be opened' })
    expect(electronState.views).toHaveLength(before)
  })

  it('attaches a native browser menu to the PR contents and acts on the current page', () => {
    const target = owner()
    showPullRequestView(target.window, {
      id: 'menu-pr', url: 'https://github.com/openai/quuu/pull/42',
      bounds: { x: 200, y: 100, width: 500, height: 500 }
    })
    const contents = electronState.views.at(-1)!.webContents
    const frame = { name: 'clicked-frame' }
    const params = {
      x: 25, y: 30, frame, isEditable: false, selectionText: '', linkURL: 'https://example.com/check',
      hasImageContents: true, editFlags: { canCopy: true }
    }
    contents.emit('context-menu', {}, params)
    expect(contents.focus).toHaveBeenCalledOnce()
    expect(electronState.popup).toHaveBeenLastCalledWith({ window: target.window, frame })
    const choose = (label: string): void => {
      const item = electronState.template.find(item => item.label === label)!
      expect(item).toBeDefined()
      item.click?.({} as MenuItem, target.window, {})
    }
    choose('Open Page in Browser')
    expect(electronState.openExternal).toHaveBeenLastCalledWith('https://github.com/openai/quuu/pull/42/files')
    choose('Copy Page URL')
    expect(electronState.copy).toHaveBeenLastCalledWith('https://github.com/openai/quuu/pull/42/files')
    choose('Open Link in Browser')
    expect(electronState.openExternal).toHaveBeenLastCalledWith(params.linkURL)
    choose('Copy Link')
    expect(electronState.copy).toHaveBeenLastCalledWith(params.linkURL)
    choose('Copy Image')
    expect(contents.copyImageAt).toHaveBeenLastCalledWith(25, 30)
    choose('Back')
    expect(contents.navigationHistory.goBack).toHaveBeenCalledOnce()
    choose('Reload')
    expect(contents.reload).toHaveBeenCalledOnce()

    contents.navigationHistory.canGoBack.mockReturnValue(false)
    contents.navigationHistory.canGoForward.mockReturnValue(true)
    contents.emit('context-menu', {}, params)
    expect(electronState.template.find(item => item.label === 'Back')?.enabled).toBe(false)
    choose('Forward')
    expect(contents.navigationHistory.goForward).toHaveBeenCalledOnce()

    closePullRequestView(target.window, 'menu-pr')
    choose('Reload')
    expect(contents.reload).toHaveBeenCalledOnce()
  })
})
