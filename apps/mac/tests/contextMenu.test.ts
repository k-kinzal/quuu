import { describe, expect, it, vi } from 'vitest'
import { contextMenuTemplate } from '../src/main/contextMenuTemplate.js'
import type { BrowserContext, ContextActions, ContextTarget } from '../src/main/contextMenuTemplate.js'

const actions: ContextActions = {
  openLink: () => { },
  copyLink: () => { },
  copyImage: () => { },
  inspect: () => { }
}

function target(patch: Partial<ContextTarget> = {}): ContextTarget {
  return {
    isEditable: false,
    selectionText: '',
    linkURL: '',
    editFlags: {
      canUndo: true,
      canRedo: false,
      canCut: true,
      canCopy: true,
      canPaste: true,
      canDelete: true,
      canSelectAll: true,
      canEditRichly: false
    },
    ...patch
  }
}

const labels = (items: ReturnType<typeof contextMenuTemplate>): string[] =>
  items.filter((i) => i.type !== 'separator').map((i) => i.label ?? '')

describe('right-click menu (foundation)', () => {
  it('editable fields get Cut / Copy / Paste', () => {
    const items = contextMenuTemplate(target({ isEditable: true }), actions, false)
    expect(labels(items)).toEqual([
      'Undo',
      'Redo',
      'Cut',
      'Copy',
      'Paste',
      'Select All'
    ])
  })

  it('editable-field items gray out according to what Chromium reports', () => {
    const items = contextMenuTemplate(
      target({
        isEditable: true,
        editFlags: {
          canUndo: false,
          canRedo: false,
          canCut: false,
          canCopy: false,
          canPaste: true,
          canDelete: false,
          canSelectAll: true,
          canEditRichly: false
        }
      }),
      actions,
      false
    )
    const byLabel = new Map(items.map((i) => [i.label, i.enabled]))
    expect(byLabel.get('Cut')).toBe(false)
    expect(byLabel.get('Paste')).toBe(true)
  })

  it('selected text can be copied even outside an editable field', () => {
    const items = contextMenuTemplate(target({ selectionText: 'エラーの本文' }), actions, false)
    expect(labels(items)).toEqual(['Copy'])
  })

  it('a whitespace-only selection shows nothing (never opens an empty menu)', () => {
    expect(contextMenuTemplate(target({ selectionText: '  \n ' }), actions, false)).toEqual([])
  })

  it('returns empty when nothing is actionable — callers use this to skip opening', () => {
    expect(contextMenuTemplate(target(), actions, false)).toEqual([])
  })

  it('over a link, open-in-browser / copy appear', () => {
    const items = contextMenuTemplate(target({ linkURL: 'https://example.com' }), actions, false)
    expect(labels(items)).toEqual(['Open Link in Browser', 'Copy Link'])
  })

  it('over an image, the image can be copied', () => {
    const items = contextMenuTemplate(target({ hasImageContents: true }), actions, false)
    expect(labels(items)).toEqual(['Copy Image'])
  })

  it('Inspect Element appears only in development builds', () => {
    expect(labels(contextMenuTemplate(target(), actions, true))).toEqual(['Inspect Element'])
    expect(labels(contextMenuTemplate(target(), actions, false))).toEqual([])
  })

  it('offers browser navigation and page actions even on a blank area in a packaged build', () => {
    const browser: BrowserContext = {
      url: 'https://github.com/openai/quuu/pull/42/files',
      canGoBack: true, canGoForward: false,
      goBack: vi.fn(), goForward: vi.fn(), reload: vi.fn()
    }
    const items = contextMenuTemplate(target(), actions, false, browser)
    expect(labels(items)).toEqual(['Back', 'Forward', 'Reload', 'Open Page in Browser', 'Copy Page URL'])
    expect(items.find(item => item.label === 'Back')?.enabled).toBe(true)
    expect(items.find(item => item.label === 'Forward')?.enabled).toBe(false)
    expect(labels(contextMenuTemplate(target({ isEditable: true, hasImageContents: true, linkURL: 'https://example.com' }), actions, false, browser)))
      .toEqual(['Undo', 'Redo', 'Cut', 'Copy', 'Paste', 'Select All', 'Copy Image', 'Open Link in Browser', 'Copy Link', 'Back', 'Forward', 'Reload', 'Open Page in Browser', 'Copy Page URL'])
  })

  it.each(['javascript:alert(1)', 'file:///tmp/run.command', 'quuu://app', 'not a URL'])(
    'does not open an executable or invalid link from remote browser content: %s', linkURL => {
      const items = contextMenuTemplate(target({ linkURL }), actions, false, {
        url: '', canGoBack: false, canGoForward: false,
        goBack: () => {}, goForward: () => {}, reload: () => {}
      })
      expect(items.find(item => item.label === 'Open Link in Browser')?.enabled).toBe(false)
      expect(items.find(item => item.label === 'Copy Link')).toBeDefined()
      expect(items.find(item => item.label === 'Open Page in Browser')?.enabled).toBe(false)
    }
  )
})
