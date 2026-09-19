// @vitest-environment jsdom
import { createRef, StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ConversationFeed, conversationBlock, ThemeProvider } from '@design-system/react'

interface Block { id: string; height: number }
interface Playback { node: HTMLElement; frames: Keyframe[]; cancel: ReturnType<typeof vi.fn> }
let playbacks: Playback[]
let callbacks: Map<number, FrameRequestCallback>
let listeners: Set<() => void>
let reduce: boolean
let now: number
let resize: () => void
const scrollPositions = new WeakMap<HTMLElement, number>()

beforeEach(() => {
  vi.useFakeTimers()
  playbacks = []
  callbacks = new Map()
  listeners = new Set()
  reduce = false
  now = 0
  let sequence = 0
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callbacks.set(++sequence, callback); return sequence })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => callbacks.delete(id))
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resize = callback }
    observe(): void {}
    disconnect(): void {}
  })
  window.matchMedia = media => ({ media, get matches() { return reduce }, onchange: null,
    addListener: () => undefined, removeListener: () => undefined,
    addEventListener: (_type: string, callback: unknown) => listeners.add(callback as () => void),
    removeEventListener: (_type: string, callback: unknown) => listeners.delete(callback as () => void), dispatchEvent: () => true })
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300)
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return Math.max(300, [...this.querySelectorAll<HTMLElement>('[data-conversation-block]')].reduce((sum, node) => sum + Number(node.dataset.height), 0))
  })
  vi.spyOn(HTMLElement.prototype, 'scrollTop', 'get').mockImplementation(function (this: HTMLElement) { return scrollPositions.get(this) ?? 0 })
  vi.spyOn(HTMLElement.prototype, 'scrollTop', 'set').mockImplementation(function (this: HTMLElement, value: number) {
    scrollPositions.set(this, Math.max(0, Math.min(value, this.scrollHeight - this.clientHeight)))
  })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const viewport = this.closest<HTMLElement>('[aria-label="Conversation"]')
    const blocks = Array.from(viewport?.querySelectorAll<HTMLElement>('[data-conversation-block]') ?? [])
    const index = blocks.indexOf(this)
    const top = index < 0 ? 0 : blocks.slice(0, index).reduce((sum, node) => sum + Number(node.dataset.height), 0) - (viewport?.scrollTop ?? 0)
    const height = index < 0 ? 300 : Number(this.dataset.height)
    return { x: 0, y: top, top, left: 0, width: 600, height, right: 600, bottom: top + height, toJSON: () => ({}) }
  })
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: function (this: HTMLElement, frames: Keyframe[]) {
    const cancel = vi.fn()
    playbacks.push({ node: this, frames, cancel })
    return { cancel }
  } })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  Reflect.deleteProperty(HTMLElement.prototype, 'animate')
})

function advance(milliseconds: number): void {
  act(() => {
    now += milliseconds
    vi.advanceTimersByTime(milliseconds)
    const pending = Array.from(callbacks.values())
    callbacks.clear()
    pending.forEach(callback => callback(now))
  })
}

const first: Block[] = [{ id: 'one', height: 400 }, { id: 'two', height: 200 }]
function Example({ blocks = first, follow = true, context = 'first', active = true, onScroll = () => undefined }: {
  blocks?: Block[]; follow?: boolean; context?: string; active?: boolean; onScroll?: () => void
}): JSX.Element {
  return <ThemeProvider><ConversationFeed revision={blocks} contextKey={context} follow={follow} active={active} aria-label="Conversation" onScroll={onScroll}>
    {blocks.map(block => <div key={block.id} {...conversationBlock(block.id)} data-height={block.height}>{block.id}<button>Read {block.id}</button></div>)}
  </ConversationFeed></ThemeProvider>
}
const viewport = (): HTMLElement => screen.getByLabelText('Conversation')

it('moves earlier content up while revealing a new block, without detaching follow on intermediate scroll events', () => {
  const onScroll = vi.fn()
  const { rerender } = render(<Example onScroll={onScroll} />)
  expect(viewport().scrollTop).toBe(300)
  expect(playbacks).toHaveLength(0)
  rerender(<Example blocks={[...first, { id: 'three', height: 150 }]} onScroll={onScroll} />)
  expect(viewport().scrollTop).toBe(300)
  expect(screen.getByRole('button', { name: 'Read three' })).toBeTruthy()
  expect(playbacks.map(playback => playback.node.dataset.conversationBlock)).toEqual(['three'])
  advance(60)
  expect(viewport().scrollTop).toBeGreaterThan(300)
  expect(viewport().scrollTop).toBeLessThan(450)
  fireEvent.scroll(viewport())
  expect(onScroll).not.toHaveBeenCalled()
  advance(120)
  expect(viewport().scrollTop).toBe(450)
  fireEvent.scroll(viewport())
  expect(onScroll).toHaveBeenCalledOnce()
  expect(playbacks.every(playback => playback.cancel.mock.calls.length === 1)).toBe(true)
})

it('reveals growth in a merged block without fading the text already being read', () => {
  const { rerender } = render(<Example />)
  rerender(<Example blocks={[first[0], { id: 'two', height: 340 }]} />)
  expect(playbacks).toHaveLength(1)
  expect(playbacks[0].node.dataset.conversationBlock).toBe('two')
  expect(playbacks[0].frames[0]).toEqual({ clipPath: 'inset(0px 0px 140px 0px)' })
  advance(180)
  expect(viewport().scrollTop).toBe(440)
})

it('settles an initial load at the latest position before fading only visible blocks', () => {
  const { rerender } = render(<Example blocks={[]} />)
  rerender(<Example />)
  expect(viewport().scrollTop).toBe(300)
  expect(callbacks.size).toBe(0)
  expect(playbacks.every(playback => playback.frames[0].opacity === 0)).toBe(true)
  advance(180)
  expect(playbacks.every(playback => playback.cancel.mock.calls.length === 1)).toBe(true)
})

it('retargets a burst from the current position and finishes at the newest content without a queue', () => {
  const { rerender } = render(<Example />)
  const second = [...first, { id: 'three', height: 150 }]
  rerender(<Example blocks={second} />)
  advance(60)
  const midway = viewport().scrollTop
  rerender(<Example blocks={[...second, { id: 'four', height: 150 }]} />)
  expect(viewport().scrollTop).toBe(midway)
  expect(playbacks[0].cancel).toHaveBeenCalledOnce()
  expect(callbacks.size).toBe(1)
  advance(180)
  expect(viewport().scrollTop).toBe(600)
  expect(callbacks.size).toBe(0)
})

it.each(['wheel', 'pointerDown', 'touchStart', 'keyDown'] as const)('hands scrolling back immediately on %s and keeps subsequent history updates still', (input) => {
  const onScroll = vi.fn()
  const { rerender } = render(<Example onScroll={onScroll} />)
  rerender(<Example blocks={[...first, { id: 'three', height: 150 }]} onScroll={onScroll} />)
  advance(60)
  fireEvent[input](viewport(), { key: 'PageUp', deltaY: -100 })
  const stopped = viewport().scrollTop
  advance(180)
  expect(viewport().scrollTop).toBe(stopped)
  fireEvent.scroll(viewport())
  expect(onScroll).toHaveBeenCalledOnce()
  playbacks = []
  rerender(<Example follow={false} blocks={[{ id: 'older', height: 100 }, ...first]} />)
  expect(viewport().scrollTop).toBe(stopped)
  expect(playbacks).toHaveLength(0)
})

it('keeps task switches, hidden panes and returning to latest immediate', () => {
  const { rerender } = render(<Example />)
  rerender(<Example blocks={[...first, { id: 'three', height: 150 }]} />)
  rerender(<Example context="second" />)
  expect(viewport().scrollTop).toBe(300)
  expect(callbacks.size).toBe(0)
  playbacks = []
  rerender(<Example context="second" active={false} blocks={[...first, { id: 'four', height: 200 }]} />)
  expect(viewport().scrollTop).toBe(300)
  rerender(<Example context="second" blocks={[...first, { id: 'four', height: 200 }]} />)
  expect(viewport().scrollTop).toBe(500)
  expect(playbacks).toHaveLength(0)
  rerender(<Example follow={false} />)
  viewport().scrollTop = 50
  rerender(<Example />)
  expect(viewport().scrollTop).toBe(300)
  expect(playbacks).toHaveLength(0)
})

it('bounds a long arrival to one viewport and follows late layout changes during the arrival', () => {
  const { rerender } = render(<Example />)
  rerender(<Example blocks={[...first, { id: 'three', height: 2400 }]} />)
  expect(viewport().scrollTop).toBe(2400)
  screen.getByText('three').dataset.height = '2500'
  act(() => resize())
  advance(180)
  expect(viewport().scrollTop).toBe(2800)
})

it('honors reduced motion immediately and when it changes during an arrival', () => {
  reduce = true
  const { rerender } = render(<Example />)
  rerender(<Example blocks={[...first, { id: 'three', height: 150 }]} />)
  expect(viewport().scrollTop).toBe(450)
  expect(playbacks).toHaveLength(0)
  reduce = false
  rerender(<Example blocks={[...first, { id: 'three', height: 300 }]} />)
  expect(callbacks.size).toBe(1)
  act(() => { reduce = true; listeners.forEach(listener => listener()) })
  expect(viewport().scrollTop).toBe(600)
  expect(callbacks.size).toBe(0)
  expect(playbacks.every(playback => playback.cancel.mock.calls.length === 1)).toBe(true)
})

it('cleans up motion and preference listeners on unmount and forwards the viewport in Strict Mode', () => {
  const ref = createRef<HTMLDivElement>()
  const example = (blocks: Block[]): JSX.Element => <StrictMode><ThemeProvider>
    <ConversationFeed ref={ref} revision={blocks} contextKey="test" follow aria-label="Conversation">
      {blocks.map(block => <div key={block.id} {...conversationBlock(block.id)} data-height={block.height}>{block.id}</div>)}
    </ConversationFeed>
  </ThemeProvider></StrictMode>
  const { rerender, unmount } = render(example(first))
  expect(ref.current).toBe(viewport())
  expect(listeners.size).toBe(1)
  rerender(example([...first, { id: 'three', height: 150 }]))
  unmount()
  expect(ref.current).toBeNull()
  expect(listeners.size).toBe(0)
  expect(callbacks.size).toBe(0)
  expect(playbacks.every(playback => playback.cancel.mock.calls.length === 1)).toBe(true)
})

it('never scrolls backwards when the first frame timestamp precedes the data commit', () => {
  const { rerender } = render(<Example />)
  now = 30
  rerender(<Example blocks={[...first, { id: 'three', height: 150 }]} />)
  act(() => {
    const pending = Array.from(callbacks.values())
    callbacks.clear()
    pending.forEach(callback => callback(10))
  })
  expect(viewport().scrollTop).toBe(300)
  advance(180)
  expect(viewport().scrollTop).toBe(450)
})

it('keeps retained text in place when a full window retires older blocks while new ones arrive', () => {
  const blocks = [...first, { id: 'three', height: 400 }]
  const { rerender } = render(<Example blocks={blocks} />)
  const visible = document.querySelector<HTMLElement>('[data-conversation-block="three"]')!
  const before = visible.getBoundingClientRect().top
  rerender(<Example blocks={[...blocks.slice(1), { id: 'four', height: 150 }]} />)
  expect(visible.getBoundingClientRect().top).toBe(before)
  advance(60)
  expect(visible.getBoundingClientRect().top).toBeLessThan(before)
  advance(120)
  expect(viewport().scrollTop).toBe(450)
})

it('keeps following after a click that does not scroll', () => {
  const { rerender } = render(<Example />)
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Read two' }))
  rerender(<Example blocks={[...first, { id: 'three', height: 150 }]} />)
  advance(180)
  expect(viewport().scrollTop).toBe(450)
})
