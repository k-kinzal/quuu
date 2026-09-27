import type { MenuItemConstructorOptions } from 'electron'

/** Roles only macOS implements. Elsewhere they are rows that do nothing. */
const MAC_ONLY_ROLES = new Set(['hide', 'hideOthers', 'unhide', 'front', 'zoom'])

/**
 * One shortcut, written the way macOS reads it, for the platform running.
 *
 * Windows has no ⌘, so Ctrl takes its place and the ⌘⌃ pair (which would collapse into Ctrl alone)
 * becomes Alt. ⌘⌫ moves off Ctrl+Backspace: accelerators are taken before the page sees a key,
 * and that one deletes a word in every input on Windows.
 */
export function platformAccelerator(mac: string, platform: NodeJS.Platform): string {
  if (platform === 'darwin') return mac
  if (mac === 'Cmd+Backspace') return 'Ctrl+Shift+Backspace'
  if (mac.startsWith('Cmd+Ctrl+')) return `Alt+${mac.slice('Cmd+Ctrl+'.length)}`
  return mac.replace(/^Cmd\+/, 'Ctrl+')
}

/** The menu as written (macOS), adapted to the platform running. The one menu stays the one place shortcuts live. */
export function menuForPlatform(
  template: MenuItemConstructorOptions[],
  platform: NodeJS.Platform
): MenuItemConstructorOptions[] {
  if (platform === 'darwin') return template
  return template
    .filter((item) => !(item.role && MAC_ONLY_ROLES.has(item.role)))
    .map((item) => ({
      ...item,
      ...(typeof item.accelerator === 'string' ? { accelerator: platformAccelerator(item.accelerator, platform) } : {}),
      ...(Array.isArray(item.submenu) ? { submenu: menuForPlatform(item.submenu, platform) } : {})
    }))
}
