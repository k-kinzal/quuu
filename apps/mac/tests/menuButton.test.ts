import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The vessel a menu uses is **decided by how it was invoked**.
 *
 *   right-click (and its keyboard equivalent) ... the OS menu (`contextMenu` in `lib/menu.ts`)
 *   press to open (buttons, chips, value rows) ... a surface inside the window (`Menu` or `SearchPicker` from `@design-system/react`)
 *
 * These two were once merged into one vessel, and `⋯`, chips and value rows all
 * opened in the right-click surface. A surface cut off from where you pressed comes out.
 * **`contextMenu` is called only from the right-click path.**
 *
 * ---
 *
 * A button that opens a menu carries no hover tooltip.
 *
 * The OS draws the menu, and the moment it opens the pointer is left sitting on the button.
 * No `mouseleave` reaches the hover tooltip, so it never goes away, and **"what hover produced"
 * and "the menu the click opened" stay stacked two deep** (that actually happened on the `⋯` in
 * the detail header: the tooltip covered the first line of the inspector).
 *
 * Forgetting it does not fail type checking, and nothing shows until you open the screen and hover.
 * So this checks that every button which opens a menu on press carries `menu`.
 */
const ROOT = join(import.meta.dirname, '..', 'src', 'renderer', 'src')

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name)
    if (e.isDirectory()) return tsxFiles(path)
    return e.isFile() && e.name.endsWith('.tsx') ? [path] : []
  })
}

/**
 * Pull out one `<IconButton ... />`.
 * An attribute can hold JSX (`icon={<X/>}`), so the closing brace is found by counting brace depth.
 */
function iconButtonBlocks(source: string): string[] {
  const blocks: string[] = []
  for (let i = source.indexOf('<IconButton'); i >= 0; i = source.indexOf('<IconButton', i + 1)) {
    let depth = 0
    for (let j = i; j < source.length; j++) {
      const c = source[j]
      if (c === '{') depth += 1
      else if (c === '}') depth -= 1
      else if (depth === 0 && c === '/' && source[j + 1] === '>') {
        blocks.push(source.slice(i, j + 2))
        break
      }
    }
  }
  return blocks
}

/** Whether a press opens a menu: either directly, or by calling an opener (pickXxx). */
function opensMenu(block: string): boolean {
  return /popupMenu\(/.test(block) || /\bpick[A-Z]\w*\(/.test(block)
}

/**
 * Lines that call `contextMenu(` where **it cannot be read as coming from a right-click**.
 *
 * Two things count as coming from a right-click.
 *   1. `onContextMenu` / `claimContextMenu` appears before the call (written right there)
 *   2. the function containing the call is passed to `onContextMenu` somewhere (traced by name)
 */
function strayContextMenuCalls(source: string): string[] {
  const lines = source.split('\n')
  /* Names appearing in `onContextMenu={...}`. It may span one line or several, so cast a wide net */
  const handlers = new Set(
    [...source.matchAll(/onContextMenu=\{([\s\S]{0,120}?)\}/g)].flatMap((m) =>
      [...m[1].matchAll(/\b([a-z]\w*)\b/g)].map((n) => n[1])
    )
  )
  const stray: string[] = []

  lines.forEach((line, i) => {
    if (!/\bcontextMenu\(/.test(line)) return
    if (/^\s*(\*|\/\/|\/\*)/.test(line)) return

    const near = lines.slice(Math.max(0, i - 10), i + 1).join('\n')
    if (/onContextMenu|claimContextMenu/.test(near)) return

    // Walk backwards to find the name of the function holding this call
    let owner: string | null = null
    for (let j = i; j >= 0 && j > i - 40; j--) {
      const declared = /^\s{0,4}const (\w+) =/.exec(lines[j])
      if (declared) {
        owner = declared[1]
        break
      }
    }
    if (owner && handlers.has(owner)) return
    stray.push(line.trim())
  })
  return stray
}

describe('the vessel a menu uses is decided by how it was invoked', () => {
  const files = tsxFiles(ROOT)

  it('opens the OS menu only from the right-click path', () => {
    const wrong: string[] = []
    for (const file of files) {
      for (const call of strayContextMenuCalls(readFileSync(file, 'utf8'))) {
        wrong.push(`${file}: ${call}`)
      }
    }
    expect(wrong).toEqual([])
  })

  /* The check itself works (mixing in a press-to-open path makes it fail) */
  it('finds a call made from a press-to-open path', () => {
    const forgot = `
      const openFromButton = (): void => {
        void contextMenu(items())
      }
      <IconButton onClick={openFromButton} />
    `
    expect(strayContextMenuCalls(forgot)).toHaveLength(1)
  })

  /* The press-to-open vessel belongs to the design system so it can stick to what was pressed */
  it('uses anchored design system surfaces for actions and searchable choices', () => {
    const usesSurface = files.filter((f) => /<(Menu|SearchPicker)\b/.test(readFileSync(f, 'utf8')))
    expect(usesSurface.length).toBeGreaterThan(5)
  })
})

describe('buttons that open a menu', () => {
  const files = tsxFiles(ROOT)

  it('can read the screen files (without that, every check below means nothing)', () => {
    expect(files.length).toBeGreaterThan(10)
    expect(files.some((f) => f.endsWith('TaskWorkspace.tsx'))).toBe(true)
  })

  it('shows no hover tooltip (it would stack two deep with the menu)', () => {
    const missing: string[] = []
    for (const file of files) {
      for (const block of iconButtonBlocks(readFileSync(file, 'utf8'))) {
        if (!opensMenu(block)) continue
        if (!/\bmenu\b/.test(block)) missing.push(`${file}: ${block.slice(0, 80)}`)
      }
    }
    expect(missing).toEqual([])
  })

  /* The check itself works (removing `menu` makes it fail) */
  it('finds one where it was forgotten', () => {
    const forgot = `<IconButton
      title="その他"
      icon={<X />}
      onClick={(e) => void popupMenu(items(), buttonAnchor(e.currentTarget))}
    />`
    const blocks = iconButtonBlocks(forgot)
    expect(blocks).toHaveLength(1)
    expect(opensMenu(blocks[0])).toBe(true)
    expect(/\bmenu\b/.test(blocks[0])).toBe(false)
  })
})
