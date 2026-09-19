// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Task } from '../src/main/tasks/types.js'
import { currentPane, focusAny, focusPane, isTyping, moveWithinList, movePaneFocus, openContextMenuAtFocus, rowActivation } from '../src/renderer/src/interaction/focus.js'
import { runTaskListKey, taskRowId } from '../src/renderer/src/interaction/listNav.js'
import { useStore } from '../src/renderer/src/state/store.js'

/**
 * Everything has to be reachable with the keyboard alone.
 *
 * What this guards is that **who the arrow keys and Enter are addressed to** is always settled.
 * The window used to catch the arrow keys, so while the hand was still in an input
 * the list silently stopped moving (right after Cmd+T moved the focus, exactly that happened).
 * It is now built so a pane (`data-pane`) holds the hand, and only the pane holding it answers.
 */

function task(id: string): Task {
  return {
    id,
    projectId: 'p1',
    title: id,
    prompt: '',
    status: 'queued',
    priority: 2,
    seq: 0,
    scheduledAt: null,
    currentRunId: null,
    sessionId: null,
    agentOverrideId: null,
    pendingMessage: '',
    reservedMessage: '',
    reviewNote: '',
    dependsOn: [],
    source: 'user',
    ruleId: null,
    externalKey: null,
    archived: false,
    createdAt: '',
    updatedAt: '',
    doneAt: null
  }
}

/** A stand-in for a DOM key event. Only the key and its modifiers are passed. */
function press(key: string, modifiers: Partial<Record<'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey', boolean>> = {}) {
  return {
    key,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...modifiers,
    prevented: false,
    preventDefault(): void {
      this.prevented = true
    }
  }
}

const ordered = [task('a'), task('b'), task('c'), task('d')]

beforeEach(() => {
  document.body.innerHTML = ''
  useStore.setState({ cursorTaskId: null, detailOpen: false })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

it('skips exiting pictures and hidden tabs when handing focus to a pane or its neighbor', () => {
  document.body.innerHTML = `
    <div inert aria-hidden="true"><div data-pane="list" tabindex="-1"></div></div>
    <div hidden><div data-pane="review" tabindex="-1"></div></div>
    <div data-pane="chat" tabindex="-1"><input data-pane-focus /></div>
    <div data-pane="inspector" tabindex="-1"></div>
  `
  expect(focusPane('list')).toBe(false)
  expect(focusAny('list', 'chat')).toBe(true)
  expect(document.activeElement?.tagName).toBe('INPUT')
  movePaneFocus(1)
  expect(currentPane()).toBe('inspector')
  movePaneFocus(1)
  expect(currentPane()).toBe('chat')
  movePaneFocus(-1)
  expect(currentPane()).toBe('inspector')
})

describe('key handling in the list', () => {
  it('starts from the head on either arrow when nothing is pointed at yet', () => {
    const down = press('ArrowDown')
    expect(runTaskListKey(down, ordered)).toBe(true)
    expect(useStore.getState().cursorTaskId).toBe('a')

    useStore.setState({ cursorTaskId: null })
    runTaskListKey(press('ArrowUp'), ordered)
    expect(useStore.getState().cursorTaskId).toBe('a')
  })

  it('moves one row at a time in display order with the arrows (j / k the same)', () => {
    useStore.setState({ cursorTaskId: 'b' })
    runTaskListKey(press('ArrowDown'), ordered)
    expect(useStore.getState().cursorTaskId).toBe('c')
    runTaskListKey(press('k'), ordered)
    expect(useStore.getState().cursorTaskId).toBe('b')
    runTaskListKey(press('j'), ordered)
    expect(useStore.getState().cursorTaskId).toBe('c')
  })

  it('stops at the ends (holding the key never jumps to the far end)', () => {
    useStore.setState({ cursorTaskId: 'a' })
    runTaskListKey(press('ArrowUp'), ordered)
    expect(useStore.getState().cursorTaskId).toBe('a')

    useStore.setState({ cursorTaskId: 'd' })
    runTaskListKey(press('ArrowDown'), ordered)
    expect(useStore.getState().cursorTaskId).toBe('d')
  })

  it('moves to the ends and by pages with Home / End / PageUp / PageDown', () => {
    useStore.setState({ cursorTaskId: 'b' })
    runTaskListKey(press('End'), ordered)
    expect(useStore.getState().cursorTaskId).toBe('d')
    runTaskListKey(press('Home'), ordered)
    expect(useStore.getState().cursorTaskId).toBe('a')
    runTaskListKey(press('PageDown'), ordered)
    expect(useStore.getState().cursorTaskId).toBe('d')
    runTaskListKey(press('PageUp'), ordered)
    expect(useStore.getState().cursorTaskId).toBe('a')
  })

  it('does not take keys carrying Cmd / Alt / Ctrl (they belong to the native menu)', () => {
    useStore.setState({ cursorTaskId: 'b' })
    expect(runTaskListKey(press('ArrowDown', { metaKey: true }), ordered)).toBe(false)
    expect(runTaskListKey(press('ArrowDown', { altKey: true }), ordered)).toBe(false)
    expect(runTaskListKey(press('Enter', { ctrlKey: true }), ordered)).toBe(false)
    expect(useStore.getState().cursorTaskId).toBe('b')
  })

  it('does nothing when there are no rows (arrows on an empty pane do not crash)', () => {
    expect(runTaskListKey(press('ArrowDown'), [])).toBe(false)
  })

  it('goes one level deeper on Enter - the second press moves the hand to the conversation', () => {
    const chat = document.createElement('div')
    chat.dataset.pane = 'chat'
    chat.tabIndex = -1
    document.body.append(chat)

    useStore.setState({ cursorTaskId: 'b', detailOpen: true })
    runTaskListKey(press('Enter'), ordered)
    expect(document.activeElement).toBe(chat)
  })
})

describe('panes (where the hand is)', () => {
  function layout(): void {
    document.body.innerHTML = `
      <div data-pane="settings" tabindex="-1"><input data-pane-focus /></div>
      <nav data-pane="rail" tabindex="-1"><button>全</button><button data-active>要</button></nav>
      <div data-pane="list" tabindex="0"></div>
      <div data-pane="composer" tabindex="-1"><textarea data-pane-focus></textarea></div>
    `
  }

  it('orders the panes exactly as the DOM does, so Cmd+Alt+Right walks them as they appear', () => {
    layout()
    focusPane('list')
    expect(currentPane()).toBe('list')
    movePaneFocus(1)
    expect(currentPane()).toBe('composer')
    // It wraps at the end (with only three to five panes, a dead end is not worth making)
    movePaneFocus(1)
    expect(currentPane()).toBe('settings')
    movePaneFocus(-1)
    expect(currentPane()).toBe('composer')
  })

  it('hands focus to the input on a pane that has one, and to the current row on a pane of rows', () => {
    layout()
    focusPane('settings')
    expect(document.activeElement?.tagName).toBe('INPUT')
    focusPane('rail')
    expect(document.activeElement?.textContent).toBe('要')
    focusPane('list')
    expect((document.activeElement as HTMLElement).dataset.pane).toBe('list')
  })

  it('skips a pane that is folded away and falls to the next candidate', () => {
    layout()
    expect(focusPane('inspector')).toBe(false)
    expect(focusAny('inspector', 'chat', 'list')).toBe(true)
    expect(currentPane()).toBe('list')
  })

  it('routes a key differently depending on whether typing is in progress', () => {
    layout()
    const input = document.querySelector('input')!
    expect(isTyping(input)).toBe(true)
    expect(isTyping(document.querySelector('[data-pane="list"]'))).toBe(false)
  })

  /*
   * A `<tr onClick>` looks pressable but can only be pressed with a pointer.
   * The agent list in settings and the run history were exactly that, with no way to open them.
   */
  it('lets even a non-button row be reached with Tab and pressed with Enter / Space', () => {
    let opened = 0
    const props = rowActivation(() => opened++)
    expect(props.tabIndex).toBe(0)
    expect(props.role).toBe('button')

    props.onKeyDown({ key: 'Enter', preventDefault: () => undefined })
    props.onKeyDown({ key: ' ', preventDefault: () => undefined })
    props.onKeyDown({ key: 'a', preventDefault: () => undefined })
    expect(opened).toBe(2)
  })

  it('walks inside a pane with the arrows (one Tab leaves the pane however many rows it has)', () => {
    layout()
    const rail = document.querySelector<HTMLElement>('[data-pane="rail"]')!
    const buttons = [...rail.querySelectorAll('button')]
    buttons[0].focus()

    const event = { ...press('ArrowDown'), currentTarget: rail } as unknown as Parameters<
      typeof moveWithinList
    >[0]
    expect(moveWithinList(event, 'button')).toBe(true)
    expect(document.activeElement).toBe(buttons[1])
  })
})

describe('the context menu (Cmd+Alt+Enter)', () => {
  it('sends it to **the row being pointed at** in a list, not to the pane', () => {
    document.body.innerHTML = `
      <div data-pane="list" tabindex="0" aria-activedescendant="${taskRowId('b')}">
        <div id="${taskRowId('a')}"></div>
        <div id="${taskRowId('b')}"></div>
      </div>
    `
    const list = document.querySelector<HTMLElement>('[data-pane="list"]')!
    list.focus()

    let target: EventTarget | null = null
    window.addEventListener('contextmenu', (e) => {
      target = e.target
      e.preventDefault()
    })
    openContextMenuAtFocus()
    expect((target as unknown as HTMLElement | null)?.id).toBe(taskRowId('b'))
  })

  it('still reaches the list row when the hand is left hanging (on body)', () => {
    document.body.innerHTML = `
      <div data-pane="list" tabindex="0" aria-activedescendant="${taskRowId('c')}">
        <div id="${taskRowId('c')}"></div>
      </div>
    `
    let target: EventTarget | null = null
    window.addEventListener('contextmenu', (e) => {
      target = e.target
      e.preventDefault()
    })
    openContextMenuAtFocus()
    expect((target as unknown as HTMLElement | null)?.id).toBe(taskRowId('c'))
  })

  it('does not send it when there are no rows (an empty menu is never shown)', () => {
    let fired = false
    window.addEventListener('contextmenu', () => (fired = true))
    openContextMenuAtFocus()
    expect(fired).toBe(false)
  })

  /*
   * A context menu coming out "at the cursor" is the OS convention, so
   * no `onContextMenu` here passes a position. Only when it is opened from the keyboard
   * does it come out under the row holding the hand, rather than under an untouched pointer.
   */
  it('opens a keyboard-opened menu under the row holding the hand', async () => {
    document.body.innerHTML = `<div data-pane="list" tabindex="0" aria-activedescendant="${taskRowId('b')}">
      <div id="${taskRowId('b')}"></div>
    </div>`
    const row = document.getElementById(taskRowId('b'))!
    row.getBoundingClientRect = () =>
      ({ left: 40, right: 400, top: 100, bottom: 128, width: 360, height: 28 }) as DOMRect
    document.querySelector<HTMLElement>('[data-pane="list"]')!.focus()

    const opened: Array<{ x?: number; y?: number }> = []
    vi.stubGlobal('quuu', {
      system: {
        popupMenu: (request: { x?: number; y?: number }) => {
          opened.push(request)
          return Promise.resolve(null)
        }
      }
    })

    const { contextMenu } = await import('../src/renderer/src/interaction/menu.js')
    window.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      void contextMenu([{ label: '実行', onSelect: () => undefined }])
    })
    openContextMenuAtFocus()

    expect(opened).toHaveLength(1)
    expect(opened[0].y).toBe(128)
    expect(opened[0].x).toBe(52)
  })

  it('leaves a pointer-opened menu without a position as before (the OS places it at the cursor)', async () => {
    const opened: Array<{ x?: number; y?: number }> = []
    vi.stubGlobal('quuu', {
      system: {
        popupMenu: (request: { x?: number; y?: number }) => {
          opened.push(request)
          return Promise.resolve(null)
        }
      }
    })
    const { contextMenu } = await import('../src/renderer/src/interaction/menu.js')
    await contextMenu([{ label: '実行', onSelect: () => undefined }])
    expect(opened[0].x).toBeUndefined()
    expect(opened[0].y).toBeUndefined()
  })
})
