import { Component, createRef, type ReactNode } from 'react'
import { styled } from '@mui/material/styles'
import { blockProps } from '../../theme/styled.js'
import { layoutMotion } from '../../theme/tokens.js'

type Edge = 'left' | 'right' | 'bottom'

/** The app identifies corresponding surfaces and their opening edge; drawing stays here. */
export function motionRegion(id: string, edge: Edge = 'right'): {
  'data-motion-region': string
  'data-motion-edge': Edge
} {
  return { 'data-motion-region': id, 'data-motion-edge': edge }
}

/** Stable content identities connect alternate presentations of the same collection. */
export function motionAnchor(id: string): { 'data-motion-anchor': string } {
  return { 'data-motion-anchor': id }
}

const Root = styled('div', { shouldForwardProp: blockProps('direction') })<{
  direction: 'horizontal' | 'vertical'
}>(({ direction }) => ({
  position: 'relative',
  display: 'flex',
  flexDirection: direction === 'vertical' ? 'column' : 'row',
  flex: '1 1 auto',
  minWidth: 0,
  minHeight: 0,
  overflow: 'hidden',
  isolation: 'isolate'
}))

interface Props {
  /** Change only for opening, closing or rearranging surfaces, never for live content or resizing. */
  motionKey: string
  /** Explicit navigation to another section is immediate, including any interrupted motion. */
  contextKey?: string
  direction?: 'horizontal' | 'vertical'
  children: ReactNode
}

interface Region {
  node: HTMLElement
  rect: DOMRect
  edge: Edge
  opacity: string
  copy: HTMLElement
  scroll: { index: number; top: number; left: number }[]
  anchors: Map<string, { rect: DOMRect; copy: HTMLElement }>
}

interface Snapshot {
  regions: Map<string, Region>
  containers: Map<HTMLElement, DOMRect>
}
const selector = '[data-motion-region]'
const reducedMotion = '(prefers-reduced-motion: reduce)'
const motionEvent = 'ds-layout-motion'

/** External drawing surfaces must follow transforms too, which ResizeObserver does not report. */
export function observeLayoutMotion(element: HTMLElement, onFrame: () => void): () => void {
  const changed = (event: Event): void => {
    if (event.target instanceof HTMLElement && event.target.contains(element)) onFrame()
  }
  element.ownerDocument.addEventListener(motionEvent, changed)
  return () => element.ownerDocument.removeEventListener(motionEvent, changed)
}

/**
 * Captures geometry before React removes a surface. Exiting pictures are inert;
 * the new React tree is usable immediately, with no delayed state or effects.
 * A lifecycle snapshot is necessary here: layout-effect cleanup is already after
 * DOM mutations, too late to capture the list before it becomes a side panel.
 */
export class MotionLayout extends Component<Props> {
  private root = createRef<HTMLDivElement>()
  private running = new Set<() => void>()
  private preference: MediaQueryList | undefined
  private frame: number | null = null
  private anchorPictures = new Map<HTMLElement, HTMLElement>()

  componentDidMount(): void {
    this.preference = window.matchMedia?.(reducedMotion)
    this.preference?.addEventListener('change', this.stop)
  }

  componentWillUnmount(): void {
    this.stop()
    this.preference?.removeEventListener('change', this.stop)
  }

  private stop = (): void => {
    for (const finish of this.running) finish()
  }

  private notify = (): void => {
    this.root.current?.dispatchEvent(new Event(motionEvent, { bubbles: true }))
  }

  private tick = (): void => {
    this.frame = null
    this.notify()
    if (this.running.size) this.frame = requestAnimationFrame(this.tick)
  }

  private regions(): HTMLElement[] {
    const root = this.root.current
    if (!root) return []
    return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter((node) =>
      !node.closest('[data-motion-picture]') &&
      node.closest('[data-motion-layout]') === root &&
      // A region moves its descendants as one unit. Nested layouts own their own motion.
      !node.parentElement?.closest(selector)?.closest('[data-motion-layout]')?.isSameNode(root)
    )
  }

  getSnapshotBeforeUpdate(previous: Props): Snapshot | null {
    if (previous.contextKey !== this.props.contextKey) {
      this.stop()
      return null
    }
    if (previous.motionKey === this.props.motionKey) return null
    if (this.preference?.matches || !this.root.current?.animate) {
      this.stop()
      return null
    }
    const snapshot: Snapshot = {
      regions: new Map(),
      containers: new Map(Array.from(this.root.current.querySelectorAll<HTMLElement>('[data-motion-container]'))
        .filter((node) => !node.closest('[data-motion-viewport]') && node.closest('[data-motion-layout]') === this.root.current)
        .map((node) => [node, node.getBoundingClientRect()]))
    }
    for (const node of this.regions()) {
      const rect = node.getBoundingClientRect()
      if (!rect.width || !rect.height) continue
      const scroll = [node, ...node.querySelectorAll<HTMLElement>('*')]
        .flatMap((element, index) => element.scrollTop || element.scrollLeft
          ? [{ index, top: element.scrollTop, left: element.scrollLeft }] : [])
      snapshot.regions.set(node.dataset.motionRegion!, {
        node, rect, scroll,
        edge: (node.dataset.motionEdge ?? 'right') as Edge,
        opacity: getComputedStyle(node).opacity,
        copy: node.cloneNode(true) as HTMLElement,
        anchors: new Map(Array.from(node.querySelectorAll<HTMLElement>('[data-motion-anchor]'), (anchor) => {
          const presented = this.anchorPictures.get(anchor) ?? anchor
          const copy = presented.cloneNode(true) as HTMLElement
          const style = getComputedStyle(presented)
          // A detached title loses inherited typography and the table cell's constraints.
          Object.assign(copy.style, {
            fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight,
            fontStyle: style.fontStyle, lineHeight: style.lineHeight,
            color: style.color, letterSpacing: style.letterSpacing,
            textAlign: style.textAlign, whiteSpace: 'nowrap', textOverflow: 'ellipsis'
          })
          return [anchor.dataset.motionAnchor!, { rect: presented.getBoundingClientRect(), copy }]
        }))
      })
    }
    // Capture the current presentation first, so a second click reverses from where it was.
    this.stop()
    return snapshot
  }

  componentDidUpdate(_previous: Props, _state: unknown, snapshot: Snapshot | null): void {
    if (!snapshot || !this.root.current) return
    const rootRect = this.root.current.getBoundingClientRect()
    const current = new Map(this.regions().map((node) => [node.dataset.motionRegion!, node]))
    // Read every final rectangle before starting animations; no read/write layout loop.
    const rects = new Map(Array.from(current, ([id, node]) => [id, node.getBoundingClientRect()]))
    const anchors = new Map(Array.from(current, ([id, node]) => [id,
      Array.from(node.querySelectorAll<HTMLElement>('[data-motion-anchor]'), (anchor) => ({
        node: anchor, rect: anchor.getBoundingClientRect(), style: getComputedStyle(anchor)
      }))
    ]))
    const containers = Array.from(snapshot.containers, ([node, before]) => ({ node, before, after: node.getBoundingClientRect() }))
    const dividers = new Set<HTMLElement>()
    for (const { node, before, after } of containers) {
      if (!node.isConnected) continue
      // A collection reparented into this material already occupied a wider area.
      // Carry that area into the material's first frame so its edge follows the detail.
      const sources = [before, ...Array.from(current, ([id, region]) =>
        node.contains(region) ? snapshot.regions.get(id)?.rect : undefined).filter((rect): rect is DOMRect => Boolean(rect))]
      const left = Math.min(...sources.map((rect) => rect.left))
      const top = Math.min(...sources.map((rect) => rect.top))
      const start = new DOMRect(left, top,
        Math.max(...sources.map((rect) => rect.right)) - left,
        Math.max(...sources.map((rect) => rect.bottom)) - top)
      if (Math.abs(start.width - after.width) > 1 || Math.abs(start.height - after.height) > 1) {
        this.resize(node, start, after, false)
        const main = node.nextElementSibling
        if (main instanceof HTMLElement && main.tagName === 'MAIN') {
          // The material is translucent, so content behind it must be clipped at
          // its moving edge too, including the main surface's monitoring band.
          this.play(main, [
            { clipPath: `inset(0px 0px 0px ${start.right - after.right}px)` },
            { clipPath: 'inset(0px 0px 0px 0px)' }
          ])
        }
      }
    }
    for (const [id, node] of current) {
      const rect = rects.get(id)!
      if (!rect.width || !rect.height) continue
      const before = snapshot.regions.get(id)
      if (!before) {
        const edge = (node.dataset.motionEdge ?? 'right') as Edge
        this.play(node, [
          { transform: this.offset(edge, rect), clipPath: this.entryClip(edge), opacity: 1 },
          { transform: 'translate(0, 0)', clipPath: 'inset(0% 0% 0% 0%)', opacity: 1 }
        ])
        this.moveDividers(node, undefined, rect, edge, dividers)
        continue
      }
      const x = before.rect.left - rect.left
      const y = before.rect.top - rect.top
      const reshaped = Math.abs(before.rect.width - rect.width) > 1 ||
        Math.abs(before.rect.height - rect.height) > 1 || before.node !== node
      if (!reshaped && Math.abs(x) < 1 && Math.abs(y) < 1) continue
      this.resize(node, before.rect, rect)
      this.moveDividers(node, before.rect, rect, before.edge, dividers)
      if (before.node !== node) {
        this.connectAnchors(before, anchors.get(id)!, rootRect, rect)
        // Supporting columns change shape; let the moving identifiers settle before
        // introducing the new metadata beside them, rather than overlapping text.
        for (const child of Array.from(node.children)) {
          if (child instanceof HTMLElement) this.play(child, [{ opacity: 0 }, { opacity: 0, offset: 0.85 }, { opacity: 1 }])
        }
        this.picture(before, rootRect, rect)
      }
    }
    for (const [id, before] of snapshot.regions) {
      if (!current.has(id)) this.picture(before, rootRect)
    }
  }

  private moveDividers(node: HTMLElement, before: DOMRect | undefined, after: DOMRect, edge: Edge, moved: Set<HTMLElement>): void {
    for (const [divider, leading] of [[node.previousElementSibling, true], [node.nextElementSibling, false]] as const) {
      if (!(divider instanceof HTMLElement) || moved.has(divider) || !divider.matches('[role="separator"], [data-motion-divider]')) continue
      // The opening edge is fixed against navigation; only the expanding edge travels.
      if (!before && (edge === 'left' ? leading : !leading)) continue
      moved.add(divider)
      const vertical = divider.getAttribute('aria-orientation') !== 'horizontal'
      const offset = before
        ? vertical
          ? `translateX(${leading ? before.left - after.left : before.right - after.right}px)`
          : `translateY(${leading ? before.top - after.top : before.bottom - after.bottom}px)`
        : this.offset(edge, after)
      this.play(divider, [{ transform: offset }, { transform: 'translate(0, 0)' }])
    }
  }

  private resize(node: HTMLElement, before: DOMRect, after: DOMRect, clip = true): void {
    // Compensating margins keep the final flex footprint constant while the live
    // surface changes size. Its content reflows without a second ghost pane.
    const geometry = {
      flex: '0 0 auto', minWidth: '0', minHeight: '0', maxWidth: 'none', maxHeight: 'none',
      boxSizing: 'border-box', ...(clip ? { overflow: 'hidden' } : { zIndex: '1' })
    }
    this.play(node, [
      { ...geometry, transform: `translate(${before.left - after.left}px, ${before.top - after.top}px)`, opacity: 1,
        width: `${before.width}px`, height: `${before.height}px`,
        marginRight: `${after.width - before.width}px`, marginBottom: `${after.height - before.height}px` },
      { ...geometry, transform: 'translate(0, 0)', opacity: 1,
        width: `${after.width}px`, height: `${after.height}px`, marginRight: '0px', marginBottom: '0px' }
    ])
  }

  private offset(edge: Edge, rect: DOMRect): string {
    if (edge === 'bottom') return `translateY(${rect.height}px)`
    return `translateX(${edge === 'left' ? -rect.width : rect.width}px)`
  }

  private entryClip(edge: Edge): string {
    if (edge === 'bottom') return 'inset(0% 0% 100% 0%)'
    return edge === 'left' ? 'inset(0% 0% 0% 100%)' : 'inset(0% 100% 0% 0%)'
  }

  private connectAnchors(before: Region, after: { node: HTMLElement; rect: DOMRect; style: CSSStyleDeclaration }[], root: DOMRect, destination: DOMRect): void {
    const viewport = this.viewport(before.rect, root)
    viewport.dataset.motionAnchors = ''
    viewport.style.zIndex = '2'
    const oldAnchors = new Map(Array.from(before.copy.querySelectorAll<HTMLElement>('[data-motion-anchor]'), (node) => [node.dataset.motionAnchor!, node]))
    for (const { node, rect, style } of after) {
      const source = before.anchors.get(node.dataset.motionAnchor!)
      if (!source || !source.rect.width || !rect.width) continue
      // Only visible titles participate; windowed or scrolled-away rows have no source on screen.
      if (source.rect.bottom <= before.rect.top || source.rect.top >= before.rect.bottom) continue
      const copy = source.copy
      this.sanitize(copy)
      Object.assign(copy.style, {
        position: 'absolute', display: 'block', margin: '0', padding: '0', border: '0',
        minWidth: '0', maxWidth: 'none', minHeight: '0', maxHeight: 'none',
        boxSizing: 'border-box', background: 'transparent', overflow: 'hidden',
        left: '0', top: '0', pointerEvents: 'none'
      })
      viewport.append(copy)
      const old = oldAnchors.get(node.dataset.motionAnchor!)
      if (old) old.style.visibility = 'hidden'
      this.anchorPictures.set(node, copy)
      this.play(node, [{ opacity: 0 }, { opacity: 0 }], () => this.anchorPictures.delete(node))
      this.play(copy, [
        { transform: `translate(${source.rect.left - before.rect.left}px, ${source.rect.top - before.rect.top}px)`, width: `${source.rect.width}px`, height: `${source.rect.height}px`,
          letterSpacing: `${Number.parseFloat(copy.style.letterSpacing) || 0}px`, fontSize: copy.style.fontSize },
        { transform: `translate(${rect.left - destination.left}px, ${rect.top - destination.top}px)`, width: `${rect.width}px`, height: `${rect.height}px`,
          letterSpacing: `${Number.parseFloat(style.letterSpacing) || 0}px`, fontSize: style.fontSize }
      ])
    }
    this.play(viewport, this.viewportFrames(before.rect, destination, root), () => viewport.remove())
  }

  private sanitize(copy: HTMLElement): void {
    copy.setAttribute('aria-hidden', 'true')
    copy.inert = true
    for (const node of [copy, ...copy.querySelectorAll<HTMLElement>('*')]) {
      for (const attribute of ['id', 'autofocus', 'data-motion-region', 'data-motion-layout', 'data-motion-anchor', 'data-motion-active', 'data-motion-container']) node.removeAttribute(attribute)
    }
    copy.querySelectorAll('iframe, webview, script, [data-motion-picture]').forEach((node) => node.remove())
  }

  private viewport(rect: DOMRect, root: DOMRect): HTMLElement {
    const viewport = document.createElement('div')
    viewport.dataset.motionViewport = ''
    viewport.setAttribute('aria-hidden', 'true')
    viewport.inert = true
    Object.assign(viewport.style, {
      position: 'absolute', overflow: 'hidden', pointerEvents: 'none', zIndex: '1',
      left: `${rect.left - root.left}px`, top: `${rect.top - root.top}px`,
      width: `${rect.width}px`, height: `${rect.height}px`
    })
    this.root.current!.append(viewport)
    return viewport
  }

  private viewportFrames(before: DOMRect, after: DOMRect, root: DOMRect): Keyframe[] {
    return [before, after].map((rect) => ({
      left: `${rect.left - root.left}px`, top: `${rect.top - root.top}px`,
      width: `${rect.width}px`, height: `${rect.height}px`
    }))
  }

  private play(node: HTMLElement, frames: Keyframe[], remove?: () => void): void {
    this.root.current?.setAttribute('data-motion-active', '')
    const animation = node.animate(frames, {
      duration: layoutMotion.duration,
      easing: layoutMotion.easing,
      fill: 'both'
    })
    const finish = (): void => {
      window.clearTimeout(deadline)
      animation.onfinish = null
      animation.oncancel = null
      animation.cancel()
      remove?.()
      this.running.delete(finish)
      if (!this.running.size) {
        this.root.current?.removeAttribute('data-motion-active')
        if (this.frame !== null) cancelAnimationFrame(this.frame)
        this.frame = null
        this.notify()
      }
    }
    // A busy or backgrounded compositor may defer finish events; never leave a picture covering the live UI.
    const deadline = window.setTimeout(finish, layoutMotion.duration)
    this.running.add(finish)
    animation.onfinish = finish
    animation.oncancel = finish
    if (this.frame === null) this.frame = requestAnimationFrame(this.tick)
  }

  private picture(before: Region, rootRect: DOMRect, destination?: DOMRect): void {
    const copy = before.copy
    const descendants = [copy, ...copy.querySelectorAll<HTMLElement>('*')]
    this.sanitize(copy)
    copy.setAttribute('data-motion-picture', '')
    const viewport = this.viewport(before.rect, rootRect)
    Object.assign(copy.style, {
      position: 'absolute', margin: '0', boxSizing: 'border-box',
      left: '0', top: '0',
      width: `${before.rect.width}px`, height: `${before.rect.height}px`,
      minWidth: '0', minHeight: '0', maxWidth: 'none', maxHeight: 'none',
      flex: 'none', overflow: 'hidden', pointerEvents: 'none', zIndex: '1',
      transform: 'none', transition: 'none', animation: 'none'
    })
    viewport.append(copy)
    for (const { index, top, left } of before.scroll) {
      const node = descendants[index]
      if (node) { node.scrollTop = top; node.scrollLeft = left }
    }
    const target = destination ? {
      transform: 'translate(0, 0)',
      width: `${destination.width}px`, height: `${destination.height}px`, opacity: 0
    } : { transform: this.offset(before.edge, before.rect), opacity: 1 }
    if (destination) this.play(viewport, this.viewportFrames(before.rect, destination, rootRect))
    this.play(copy, [
      { transform: 'translate(0, 0)', width: `${before.rect.width}px`, height: `${before.rect.height}px`, opacity: before.opacity },
      // Old and new text must not remain superimposed while a table becomes a narrow list.
      ...(destination ? [{ opacity: 0, offset: 0.5 }] : []),
      target
    ], () => viewport.remove())
  }

  render(): JSX.Element {
    return <Root ref={this.root} data-motion-layout="" direction={this.props.direction ?? 'horizontal'}>{this.props.children}</Root>
  }
}
