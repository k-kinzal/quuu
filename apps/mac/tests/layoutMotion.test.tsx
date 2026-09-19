// @vitest-environment jsdom
import { useEffect } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AppShellMain, GlassPanel, MotionLayout, motionRegion, motionAnchor, observeLayoutMotion, Panel, Reveal, ThemeProvider } from '@design-system/react'

interface Playback {
  node: HTMLElement
  frames: Keyframe[]
  options: KeyframeAnimationOptions
  animation: { onfinish: (() => void) | null; oncancel: (() => void) | null; cancel: ReturnType<typeof vi.fn> }
}
let playbacks: Playback[]
let reduce: boolean
let preferenceListeners: Set<() => void>

beforeEach(() => {
  playbacks = []
  reduce = false
  preferenceListeners = new Set()
  window.matchMedia = (media) => ({
    media, get matches() { return reduce }, onchange: null,
    addListener: () => undefined, removeListener: () => undefined,
    addEventListener: (_type: string, listener: unknown) => { preferenceListeners.add(listener as () => void) },
    removeEventListener: (_type: string, listener: unknown) => { preferenceListeners.delete(listener as () => void) },
    dispatchEvent: () => true
  })
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, writable: true,
    value: function (this: HTMLElement, frames: Keyframe[], options: KeyframeAnimationOptions) {
      const animation = { onfinish: null, oncancel: null, cancel: vi.fn() }
      playbacks.push({ node: this, frames, options, animation })
      return animation
    }
  })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const width = Number(this.dataset.width ?? 800)
    const height = 600
    const left = Number(this.dataset.left ?? 0)
    return { x: left, y: 0, left, top: 0, right: left + width, bottom: height, width, height, toJSON: () => ({}) }
  })
})

afterEach(() => { cleanup(); vi.restoreAllMocks(); Reflect.deleteProperty(HTMLElement.prototype, 'animate') })

function Detail({ onMount, onClick }: { onMount(): void; onClick(): void }): JSX.Element {
  useEffect(onMount, [onMount])
  return <Panel {...motionRegion('detail')} data-left="280" data-width="520"><button id="detail-action" onClick={onClick}>Use detail</button></Panel>
}

function Example({ open, context = 'list', text = 'One', onMount = () => undefined, onClick = () => undefined }: {
  open: boolean; context?: string; text?: string; onMount?(): void; onClick?(): void
}): JSX.Element {
  return <ThemeProvider><MotionLayout motionKey={String(open)} contextKey={context}>
    {open ? <aside><Panel {...motionRegion('collection', 'left')} data-width="280">{text}</Panel></aside>
      : <Panel {...motionRegion('collection', 'left')} data-width="800"><input id="list-input" defaultValue={text} /></Panel>}
    {open && <Detail onMount={onMount} onClick={onClick} />}
  </MotionLayout></ThemeProvider>
}

it('opens the detail from the right while the collection moves into the menu, with no delay in effects or actions', () => {
  const mounted = vi.fn()
  const clicked = vi.fn()
  const { rerender } = render(<Example open={false} onMount={mounted} onClick={clicked} />)
  expect(playbacks).toHaveLength(0)
  rerender(<Example open onMount={mounted} onClick={clicked} />)
  expect(mounted).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'Use detail' }))
  expect(clicked).toHaveBeenCalledTimes(1)
  const detail = playbacks.find((p) => p.node.dataset.motionRegion === 'detail')!
  expect(detail.frames[0].transform).toBe('translateX(520px)')
  expect(detail.options.duration).toBeLessThanOrEqual(200)
  const picture = document.querySelector<HTMLElement>('[data-motion-picture]')!
  expect(picture.inert).toBe(true)
  expect(picture.getAttribute('aria-hidden')).toBe('true')
  expect(picture.querySelector('[id]')).toBeNull()
  expect(screen.queryByRole('textbox')).toBeNull()
  const collection = playbacks.find((p) => p.node === picture)!
  expect(collection.frames.at(-1)?.width).toBe('280px')
})

it('closes to the right, exposes the list immediately, and removes the exiting picture at completion', () => {
  const { rerender } = render(<Example open />)
  rerender(<Example open={false} />)
  expect(screen.getByRole('textbox')).toBeTruthy()
  expect(screen.queryByRole('button')).toBeNull()
  const outgoing = playbacks.find((p) => p.node.textContent === 'Use detail')!
  expect(outgoing.frames.at(-1)?.transform).toBe('translateX(520px)')
  expect(outgoing.node.parentElement?.style.overflow).toBe('hidden')
  expect(outgoing.node.parentElement?.style.left).toBe('280px')
  expect(outgoing.node.parentElement?.style.width).toBe('520px')
  for (const { animation } of playbacks) animation.onfinish?.()
  expect(document.querySelector('[data-motion-picture]')).toBeNull()
})

it('clips both opening edges before they can cross adjacent navigation', () => {
  const example = (open: boolean): JSX.Element => <ThemeProvider><MotionLayout motionKey={String(open)}>
    <aside>Fixed navigation</aside>
    <div data-motion-divider="" aria-label="Fixed left boundary" />
    {open && <><Panel {...motionRegion('collection', 'left')} data-left="208" data-width="280">Collection</Panel><div role="separator" aria-label="Collection edge" /></>}
    {open && <><div role="separator" aria-label="Inspector edge" /><Panel {...motionRegion('inspector', 'right')} data-left="700" data-width="300">Inspector</Panel></>}
    <div data-motion-divider="" aria-label="Fixed right boundary" />
    <aside>Fixed tools</aside>
  </MotionLayout></ThemeProvider>
  const { rerender } = render(example(false))
  rerender(example(true))
  expect(playbacks.find((p) => p.node.textContent === 'Collection')?.frames[0].clipPath).toBe('inset(0% 0% 0% 100%)')
  expect(playbacks.find((p) => p.node.textContent === 'Inspector')?.frames[0].clipPath).toBe('inset(0% 100% 0% 0%)')
  expect(playbacks.find((p) => p.node.getAttribute('aria-label') === 'Collection edge')?.frames[0].transform).toBe('translateX(-280px)')
  expect(playbacks.find((p) => p.node.getAttribute('aria-label') === 'Inspector edge')?.frames[0].transform).toBe('translateX(300px)')
  expect(playbacks.some((p) => p.node.getAttribute('aria-label')?.startsWith('Fixed'))).toBe(false)
  rerender(example(false))
  const viewports = Array.from(document.querySelectorAll<HTMLElement>('[data-motion-viewport]'))
  expect(viewports.map((node) => [node.style.left, node.style.width, node.style.overflow])).toEqual([
    ['208px', '280px', 'hidden'], ['700px', '300px', 'hidden']
  ])
})

it('resizes a retained pane as one opaque surface without changing its final flex footprint', () => {
  const example = (wide: boolean): JSX.Element => <ThemeProvider><MotionLayout motionKey={String(wide)}>
    <AppShellMain><Panel {...motionRegion('detail')} data-left={wide ? '208' : '488'} data-width={wide ? '792' : '512'}>Live content</Panel></AppShellMain>
  </MotionLayout></ThemeProvider>
  const { rerender } = render(example(false))
  rerender(example(true))
  expect(document.querySelector('[data-motion-picture]')).toBeNull()
  const motion = playbacks[0]
  expect(motion.frames.map((frame) => frame.opacity)).toEqual([1, 1])
  expect(motion.frames.map((frame) => [frame.width, frame.marginRight])).toEqual([['512px', '280px'], ['792px', '0px']])
  const main = screen.getByRole('main')
  expect(getComputedStyle(main).overflow).toBe('visible')
  expect(getComputedStyle(main).backgroundColor).toBe('rgba(0, 0, 0, 0)')
  for (const { animation } of playbacks) animation.onfinish?.()
  expect(getComputedStyle(main).overflow).toBe('hidden')
})

it('connects matching titles across reparented collection layouts without drawing either title twice', () => {
  const example = (compact: boolean): JSX.Element => <ThemeProvider><MotionLayout motionKey={String(compact)}>
    {compact ? <aside><Panel {...motionRegion('list')} data-left="208" data-width="280">
      <span {...motionAnchor('one')} data-left="228" data-width="240">One item</span>
    </Panel></aside> : <Panel {...motionRegion('list')} data-left="208" data-width="800">
      <button {...motionAnchor('one')} data-left="248" data-width="360">One item</button>
    </Panel>}
  </MotionLayout></ThemeProvider>
  const { rerender, unmount } = render(example(false))
  rerender(example(true))
  const bridge = document.querySelector<HTMLElement>('[data-motion-anchors]')!
  expect(bridge.inert).toBe(true)
  expect(bridge.style.overflow).toBe('hidden')
  expect(bridge.textContent).toBe('One item')
  const title = playbacks.find((p) => p.node.parentElement === bridge)!
  expect(title.frames.map((frame) => frame.transform)).toEqual(['translate(40px, 0px)', 'translate(20px, 0px)'])
  expect(document.querySelector<HTMLElement>('[data-motion-picture] button')?.style.visibility).toBe('hidden')
  const live = document.querySelector('[data-motion-anchor="one"]')
  expect(playbacks.find((p) => p.node === live)?.frames.map((frame) => frame.opacity)).toEqual([0, 0])
  unmount()
  expect(playbacks.every((p) => p.animation.cancel.mock.calls.length === 1)).toBe(true)
})

it('keeps the material edge with the collection as it joins the navigation', () => {
  const example = (open: boolean): JSX.Element => <ThemeProvider><MotionLayout motionKey={String(open)}>
    <GlassPanel data-width={open ? '488' : '208'}>
      <Panel {...motionRegion('navigation')} data-width="208">Navigation</Panel>
      {open && <><Panel {...motionRegion('collection')} data-left="208" data-width="280">Items</Panel><div role="separator" aria-orientation="vertical" /></>}
    </GlassPanel>
    <AppShellMain>{!open && <Panel {...motionRegion('collection')} data-left="208" data-width="800">Items</Panel>}</AppShellMain>
  </MotionLayout></ThemeProvider>
  const { rerender } = render(example(false))
  rerender(example(true))
  const material = playbacks.find((p) => p.node.hasAttribute('data-motion-container'))!
  expect(material.frames.map((frame) => frame.width)).toEqual(['1008px', '488px'])
  expect(material.frames.map((frame) => frame.marginRight)).toEqual(['-520px', '0px'])
  const divider = playbacks.find((p) => p.node.getAttribute('role') === 'separator')!
  expect(divider.frames[0].transform).toBe('translateX(520px)')
  const main = playbacks.find((p) => p.node.tagName === 'MAIN')!
  expect(main.frames.map((frame) => frame.clipPath)).toEqual(['inset(0px 0px 0px 520px)', 'inset(0px 0px 0px 0px)'])
})

it('accepts a reversal before completion and cleans up every animation on unmount', () => {
  const { rerender, unmount } = render(<Example open={false} />)
  rerender(<Example open />)
  const first = [...playbacks]
  rerender(<Example open={false} />)
  expect(first.every((p) => p.animation.cancel.mock.calls.length === 1)).toBe(true)
  expect(screen.getAllByRole('textbox')).toHaveLength(1)
  unmount()
  expect(playbacks.every((p) => p.animation.cancel.mock.calls.length === 1)).toBe(true)
  expect(document.querySelector('[data-motion-picture]')).toBeNull()
})

it('retires pictures on time even when the compositor does not report completion', () => {
  vi.useFakeTimers()
  try {
    const { rerender } = render(<Example open={false} />)
    rerender(<Example open />)
    expect(document.querySelector('[data-motion-picture]')).toBeTruthy()
    act(() => { vi.advanceTimersByTime(200) })
    expect(document.querySelector('[data-motion-picture]')).toBeNull()
    expect(playbacks.every((p) => p.animation.cancel.mock.calls.length === 1)).toBe(true)
  } finally {
    vi.useRealTimers()
  }
})

it('keeps explicit section switches, live updates and resizing immediate', () => {
  const { rerender } = render(<Example open />)
  rerender(<Example open text="Live update" />)
  expect(playbacks).toHaveLength(0)
  rerender(<Example open={false} context="settings" />)
  expect(playbacks).toHaveLength(0)
})

it('cancels an in-flight transition when explicit navigation changes the section', () => {
  const { rerender } = render(<Example open={false} />)
  rerender(<Example open />)
  rerender(<Example open={false} context="settings" />)
  expect(playbacks.every((p) => p.animation.cancel.mock.calls.length === 1)).toBe(true)
  expect(document.querySelector('[data-motion-picture]')).toBeNull()
})

it('honors reduced motion at opening and when the OS preference changes mid-transition', () => {
  reduce = true
  const { rerender } = render(<Example open={false} />)
  rerender(<Example open />)
  expect(playbacks).toHaveLength(0)
  reduce = false
  rerender(<Example open={false} />)
  expect(playbacks.length).toBeGreaterThan(0)
  act(() => { reduce = true; preferenceListeners.forEach((listener) => listener()) })
  expect(playbacks.every((p) => p.animation.cancel.mock.calls.length === 1)).toBe(true)
  expect(document.querySelector('[data-motion-picture]')).toBeNull()
})

it('keeps folded bodies lazy, restores focus on close, and removes them after sliding out', async () => {
  const body = vi.fn(() => <input aria-label="Inside disclosure" />)
  const example = (open: boolean): JSX.Element => <ThemeProvider><button>Disclosure</button><Reveal open={open}>{body}</Reveal></ThemeProvider>
  const { rerender } = render(example(false))
  const trigger = screen.getByRole('button')
  trigger.focus()
  expect(body).not.toHaveBeenCalled()
  rerender(example(true))
  const input = screen.getByRole('textbox')
  input.focus()
  rerender(example(false))
  expect(screen.queryByRole('textbox')).toBeNull()
  expect(input.parentElement?.inert).toBe(true)
  expect(document.activeElement).toBe(trigger)
  await waitFor(() => expect(document.body.contains(input)).toBe(false))
})

it('tells embedded drawing surfaces when their layout settles, and stops after unsubscribe', () => {
  const { rerender } = render(<Example open={false} />)
  const layout = document.querySelector<HTMLElement>('[data-motion-layout]')!
  const affected = vi.fn()
  const unrelated = vi.fn()
  const stop = observeLayoutMotion(layout, affected)
  const stopUnrelated = observeLayoutMotion(document.createElement('div'), unrelated)
  rerender(<Example open />)
  for (const { animation } of playbacks) animation.onfinish?.()
  expect(affected).toHaveBeenCalled()
  expect(unrelated).not.toHaveBeenCalled()
  stop()
  stopUnrelated()
  affected.mockClear()
  rerender(<Example open={false} />)
  for (const { animation } of playbacks) animation.onfinish?.()
  expect(affected).not.toHaveBeenCalled()
})
