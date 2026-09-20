import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AppCommandSchema } from '../src/preload/api/desktop.js'

/**
 * The native menu is the complete set of actions.
 *
 * The rule is that a shortcut is defined in the menu and nowhere else, so
 * **an action missing from the menu does not exist from the keyboard** (macOS uses the menu as the
 * entry point for Ctrl+F2 and help search, so anything listed there is always reachable).
 * Conversely, a command in the menu that the screen does not know does nothing when pressed.
 * Neither fails type checking, so both sides are matched up here.
 */
const ROOT = join(import.meta.dirname, '..')

const mainMenu = readFileSync(join(ROOT, 'src/main/menus.ts'), 'utf8')
const app = readFileSync(join(ROOT, 'src/renderer/src/App.tsx'), 'utf8')

const commands = AppCommandSchema.options.map(option => option.value)

describe('every action is reachable from the menu', () => {
  it('can read the list of commands (without that, every match below means nothing)', () => {
    expect(commands.length).toBeGreaterThan(20)
    expect(commands).toContain('task.open')
  })

  it('puts every command somewhere in the native menu', () => {
    const sent = new Set([...mainMenu.matchAll(/send\('([\w.]+)'/g)].map((m) => m[1]))
    expect([...commands].filter((c) => !sent.has(c))).toEqual([])
  })

  it('has the screen handling every command (never make a row that does nothing when pressed)', () => {
    const handled = new Set([...app.matchAll(/case '([\w.]+)'/g)].map((m) => m[1]))
    expect([...commands].filter((c) => !handled.has(c))).toEqual([])
  })

  /*
   * Anything that moves where the hand is has to be pressable without opening the menu.
   * Make it far away and getting back to the list means walking two levels of menu,
   * which puts keyboard-only operation out of reach.
   */
  it('gives every hand-moving command a key assignment', () => {
    const needsKey = [
      'view.palette',
      'view.search',
      'focus.next',
      'focus.prev',
      'menu.context',
      'task.open',
      'panel.list',
      // Retracing steps through a menu defeats the point of retracing steps
      'view.back',
      'view.forward'
    ]
    for (const command of needsKey) {
      const line = mainMenu
        .split('\n')
        .find((l) => l.includes(`send('${command}'`))
      const around = line ? nearbyAccelerator(mainMenu, line) : null
      expect(around, `${command} has no accelerator`).toBeTruthy()
    }
  })
})

describe('menu accelerators do not steal the keys of the screen', () => {
  const accelerators = [...mainMenu.matchAll(/accelerator:\s*[`']([^`']+)[`']/g)].map((m) => m[1])

  it('can read the accelerators', () => {
    expect(accelerators.length).toBeGreaterThan(10)
  })

  /*
   * A menu accelerator is taken before the renderer sees it.
   * Overlapping the composer commit key makes **sending stop working** (that actually happened).
   */
  it('does not take the composer commit keys (Cmd+Enter / Ctrl+Enter / Shift+Cmd+Enter)', () => {
    const submit = ['Cmd+Return', 'Ctrl+Return', 'Cmd+Shift+Return', 'CommandOrControl+Return']
    expect(accelerators.filter((a) => submit.includes(a))).toEqual([])
  })

  it('does not take Esc or a bare key (never steal one-step-back from an input or the palette)', () => {
    const bare = accelerators.filter((a) => !a.includes('+'))
    expect(bare).toEqual([])
  })
})

describe('Help opens the public repository', () => {
  it('points How to Use at k-kinzal/quuu, not the old repo name', () => {
    expect(mainMenu).toContain("openExternal('https://github.com/k-kinzal/quuu#readme')")
    expect(mainMenu).not.toContain('k-kinzal/taskd')
  })
})

/** Whether the menu item (`{ ... }`) containing that line has an accelerator. */
function nearbyAccelerator(source: string, line: string): string | null {
  const index = source.indexOf(line)
  const start = source.lastIndexOf('{', index)
  const end = source.indexOf('}', index)
  const item = source.slice(start, end)
  return /accelerator:\s*'([^']+)'/.exec(item)?.[1] ?? null
}
