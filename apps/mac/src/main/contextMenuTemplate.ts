import type { ContextMenuParams, MenuItemConstructorOptions } from 'electron'
import { t } from './i18n/index.js'

/**
 * Decides what the right-click menu shows.
 *
 * Doesn't import electron, so it's testable as-is (`tests/contextMenu.test.ts`).
 * `contextMenu.ts` does the actual opening.
 */

/** Only this is used for the decision. Lets tests pass a minimal shape. */
export type ContextTarget = Pick<
  ContextMenuParams,
  'isEditable' | 'selectionText' | 'linkURL' | 'editFlags'
> &
  Partial<Pick<ContextMenuParams, 'hasImageContents'>>

export interface ContextActions {
  openLink(url: string): void
  copyLink(url: string): void
  copyImage(): void
  inspect(): void
}

export interface BrowserContext {
  url: string
  canGoBack: boolean
  canGoForward: boolean
  goBack(): void
  goForward(): void
  reload(): void
}

/** Remote content may link to executable schemes; external navigation is limited to web URLs. */
export function isWebUrl(value: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

export function contextMenuTemplate(
  params: ContextTarget,
  actions: ContextActions,
  dev: boolean,
  browser?: BrowserContext
): MenuItemConstructorOptions[] {
  const items: MenuItemConstructorOptions[] = []
  const flags = params.editFlags

  if (params.isEditable) {
    /*
     * Roles are used so the behavior matches the OS exactly, including
     * mid-IME-composition and pasting from outside the app. Only enabled
     * follows Chromium's judgment (no items that can be clicked but do nothing)
     */
    items.push(
      { role: 'undo', label: t('contextMenu.undo'), enabled: flags.canUndo },
      { role: 'redo', label: t('contextMenu.redo'), enabled: flags.canRedo },
      { type: 'separator' },
      { role: 'cut', label: t('contextMenu.cut'), enabled: flags.canCut },
      { role: 'copy', label: t('contextMenu.copy'), enabled: flags.canCopy },
      { role: 'paste', label: t('contextMenu.paste'), enabled: flags.canPaste },
      { type: 'separator' },
      { role: 'selectAll', label: t('contextMenu.selectAll'), enabled: flags.canSelectAll }
    )
  } else if (params.selectionText.trim().length > 0) {
    items.push({ role: 'copy', label: t('contextMenu.copy'), enabled: flags.canCopy })
  }

  /*
   * A way to take images out. What appears in conversations is screenshots,
   * so a spotted bug must be pasteable elsewhere as-is.
   */
  if (params.hasImageContents) {
    if (items.length > 0) items.push({ type: 'separator' })
    items.push({ label: t('contextMenu.copyImage'), click: () => actions.copyImage() })
  }

  if (params.linkURL) {
    if (items.length > 0) items.push({ type: 'separator' })
    items.push(
      { label: t('contextMenu.openLink'), enabled: !browser || isWebUrl(params.linkURL), click: () => actions.openLink(params.linkURL) },
      { label: t('contextMenu.copyLink'), click: () => actions.copyLink(params.linkURL) }
    )
  }

  if (browser) {
    if (items.length > 0) items.push({ type: 'separator' })
    items.push(
      { label: t('contextMenu.back'), enabled: browser.canGoBack, click: () => browser.goBack() },
      { label: t('contextMenu.forward'), enabled: browser.canGoForward, click: () => browser.goForward() },
      { label: t('contextMenu.reload'), click: () => browser.reload() },
      { type: 'separator' },
      { label: t('contextMenu.openPage'), enabled: isWebUrl(browser.url), click: () => actions.openLink(browser.url) },
      { label: t('contextMenu.copyPageUrl'), enabled: isWebUrl(browser.url), click: () => actions.copyLink(browser.url) }
    )
  }

  // Dev only. Not an everyday operation, so it doesn't appear in the packaged build
  if (dev) {
    if (items.length > 0) items.push({ type: 'separator' })
    items.push({ label: t('contextMenu.inspect'), click: () => actions.inspect() })
  }

  return items
}
