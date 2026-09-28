/**
 * A shortcut as the person at this machine reads it.
 *
 * Hints are written once, in the notation the native menu uses (`Cmd+Shift+N`, read the macOS
 * way — main/menus.ts). macOS shows its glyphs (`⌘⇧N`); elsewhere Ctrl stands in for ⌘ and ⌘⌃
 * becomes Alt, the same mapping the menu itself goes through there (main/menuPlatform.ts), so a
 * hint never names a key the menu does not answer to.
 */
const MAC_GLYPHS: Record<string, string> = { Cmd: '⌘', Alt: '⌥', Shift: '⇧', Ctrl: '⌃', Return: '⏎', Enter: '↵', Backspace: '⌫' }

export function shortcutLabel(accelerator: string, mac: boolean): string {
  if (mac) return accelerator.split('+').map((key) => MAC_GLYPHS[key] ?? key).join('')
  const mapped = accelerator === 'Cmd+Backspace' ? 'Ctrl+Shift+Backspace'
    : accelerator.startsWith('Cmd+Ctrl+') ? `Alt+${accelerator.slice('Cmd+Ctrl+'.length)}`
    : accelerator.replace(/^Cmd\+/, 'Ctrl+')
  return mapped.replace(/\bReturn\b/, 'Enter')
}

/** Key names a Windows keyboard prints where macOS prints glyphs. */
const PC_KEYS: Record<string, string> = { '⇧': 'Shift', '⌥': 'Alt', '⌃': 'Ctrl', '⌘': 'Ctrl', '⏎': 'Enter', '↵': 'Enter', '⌫': 'Backspace' }

/**
 * A design-system string pack for this keyboard.
 *
 * The design system writes its key hints (`⇧ for 1px steps`) the macOS way and takes whatever
 * pack the app hands it. On other keyboards the same pack is handed over with key names instead.
 */
export function stringsForKeyboard<T>(pack: T, mac: boolean): T {
  if (mac) return pack
  const rename = (text: string): string => text.replace(/[⇧⌥⌃⌘⏎↵⌫]/g, (glyph) => PC_KEYS[glyph])
  const convert = (value: unknown): unknown => {
    if (typeof value === 'string') return rename(value)
    if (typeof value === 'function') return (...args: unknown[]) => convert((value as (...a: unknown[]) => unknown)(...args))
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, convert(entry)]))
    return value
  }
  return convert(pack) as T
}
