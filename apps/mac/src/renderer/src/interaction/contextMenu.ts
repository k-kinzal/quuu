import type { MenuItemSpec } from '@design-system/react'
import { t } from '../model/i18n/index.js'

/**
 * The parts for assembling right-click menus.
 *
 * A context menu exists to make "what is right here extractable right here" true, so every
 * copy entry point is gathered here. Writing the extraction per screen leaves holes where
 * one screen can copy and the one next to it can't.
 */

/** To the clipboard. Owned by main (the renderer holds no such permission). */
export function copyText(text: string): void {
  void window.quuu.system.copy(text)
}

/** The currently selected text. */
export function selectionText(): string {
  return window.getSelection()?.toString() ?? ''
}

/**
 * "Copy selection".
 *
 * Surfaces that raise their own menu stop `contextmenu`, so the OS's copy disappears just
 * there. Whenever there is a selection, always prepend this — never create
 * "I selected it and can't copy it".
 */
export function selectionItems(): MenuItemSpec[] {
  const text = selectionText()
  if (text.trim().length === 0) return []
  return [{ label: t('contextMenu.copySelection'), onSelect: () => copyText(text) }]
}

/**
 * Draw a separator, then lay the items out.
 * Adds nothing when empty (so a surface with no values isn't left holding a bare divider).
 */
export function group(items: MenuItemSpec[]): MenuItemSpec[] {
  if (items.length === 0) return []
  return [{ ...items[0], separatorBefore: true }, ...items.slice(1)]
}

/** A row that carries a value. Never let an empty value make a dead row in the menu. */
export function copyItem(label: string, value: string | null | undefined): MenuItemSpec[] {
  if (!value) return []
  return [{ label, onSelect: () => copyText(value) }]
}

/** The path rows (copy and Finder). Every surface that deals in paths offers these two. */
export function pathItems(path: string | null | undefined, label = t('contextMenu.path')): MenuItemSpec[] {
  if (!path) return []
  return [
    { label: t('contextMenu.copyLabel', { label }), onSelect: () => copyText(path) },
    { label: t('contextMenu.showInFinder'), onSelect: () => void window.quuu.system.reveal(path) }
  ]
}

/**
 * Confirmation for an irreversible action. Asked with an OS sheet.
 *
 * The default is the "cancel" side (`main/ipc.ts`), so hammering ⏎ can't push a delete through.
 */
export function confirmDestructive(
  message: string,
  detail: string,
  confirmLabel = t('contextMenu.confirmDelete')
): Promise<boolean> {
  return window.quuu.system.confirm({ message, detail, confirmLabel })
}
