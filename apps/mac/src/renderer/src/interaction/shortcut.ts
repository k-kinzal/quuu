import { shortcutLabel, stringsForKeyboard } from '../model/shortcuts.js'

/** A hint for this machine's keyboard. Outside Electron (tests, Storybook) it reads as macOS. */
export function shortcut(accelerator: string): string {
  return shortcutLabel(accelerator, macKeyboard())
}

/** The design system's strings, with its key hints named for this keyboard. */
export function keyboardStrings<T>(pack: T): T {
  return stringsForKeyboard(pack, macKeyboard())
}

function macKeyboard(): boolean {
  return (window.quuuPlatform ?? 'darwin') === 'darwin'
}
