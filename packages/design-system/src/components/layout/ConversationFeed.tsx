import { Component, createRef, forwardRef, type HTMLAttributes, type ForwardedRef } from 'react'
import { styled } from '@mui/material/styles'
import { conversationMotion } from '../../theme/tokens.js'
import { ConversationScroll } from './ConversationLayout.js'

/** Identify rendered blocks, including blocks whose body can grow in place. */
export function conversationBlock(id: string): { 'data-conversation-block': string } {
  return { 'data-conversation-block': id }
}

const Content = styled('div')({ display: 'flow-root' })
const Scroll = styled(ConversationScroll)({ overflowAnchor: 'none' })

interface Props extends HTMLAttributes<HTMLDivElement> {
  /** A data revision, not a clock or disclosure state. */
  revision: unknown
  contextKey: string
  follow: boolean
  active?: boolean
}
interface Snapshot {
  top: number
  blocks: Map<string, { height: number; top: number }>
}

/** Owns arrival motion and its scroll events together so automatic movement cannot detach following. */
class Feed extends Component<Props & { viewportRef: ForwardedRef<HTMLDivElement> }> {
  private viewport: HTMLDivElement | null = null
  private content = createRef<HTMLDivElement>()
  private frame: number | null = null
  private deadline: number | null = null
  private target: number | null = null
  private animations = new Set<Animation>()
  private preference: MediaQueryList | null = null
  private observer: ResizeObserver | null = null

  private setViewport = (node: HTMLDivElement | null): void => {
    this.viewport = node
    const ref = this.props.viewportRef
    if (typeof ref === 'function') ref(node)
    else if (ref) ref.current = node
  }

  componentDidMount(): void {
    this.preference = window.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null
    this.preference?.addEventListener('change', this.reduceMotion)
    this.toLatest()
    // Images and highlighted content can finish after the data commit. Follow only
    // during an arrival, so opening a disclosure never pulls it out from under a reader.
    if (typeof ResizeObserver !== 'undefined' && this.content.current) {
      this.observer = new ResizeObserver(() => {
        if (this.target !== null && this.viewport) this.target = this.bottom()
      })
      this.observer.observe(this.content.current)
    }
  }

  componentWillUnmount(): void {
    this.stop()
    this.observer?.disconnect()
    this.preference?.removeEventListener('change', this.reduceMotion)
  }

  getSnapshotBeforeUpdate(previous: Props): Snapshot | null {
    if (previous.revision === this.props.revision) return null
    const edge = this.viewport?.getBoundingClientRect().top ?? 0
    return {
      top: this.viewport?.scrollTop ?? 0,
      blocks: new Map(this.blocks().map(node => {
        const rect = node.getBoundingClientRect()
        return [node.dataset.conversationBlock!, { height: rect.height, top: rect.top - edge }]
      }))
    }
  }

  componentDidUpdate(previous: Props, _state: unknown, snapshot: Snapshot | null): void {
    const navigation = previous.contextKey !== this.props.contextKey || previous.active !== this.props.active
    if (navigation || previous.follow !== this.props.follow) {
      this.stop()
      this.toLatest()
      return
    }
    if (!snapshot || !this.props.active || !this.props.follow || !this.viewport) return
    this.stop()
    const viewport = this.viewport
    const bottom = this.bottom()
    const initial = snapshot.blocks.size === 0
    if (this.preference?.matches) {
      viewport.scrollTop = bottom
      return
    }

    // Bound travel, not content: a whole page arriving at once should be readable
    // promptly, without racing through several screens or queuing a typewriter effect.
    const edge = viewport.getBoundingClientRect()
    const positions = this.blocks().map(node => ({ node, rect: node.getBoundingClientRect() }))
    const retained = positions.findLast(({ node }) => snapshot.blocks.has(node.dataset.conversationBlock!))
    // A bounded feed may retire its oldest blocks in the same commit. Preserve a
    // retained block's screen position instead of carrying over an obsolete offset.
    const anchored = retained ? viewport.scrollTop + retained.rect.top - edge.top - snapshot.blocks.get(retained.node.dataset.conversationBlock!)!.top : snapshot.top
    const start = initial ? bottom : Math.max(0, Math.min(bottom, Math.max(anchored, bottom - viewport.clientHeight)))
    viewport.scrollTop = start
    const measurements = this.blocks().map(node => ({ node, rect: node.getBoundingClientRect() }))
    for (const { node, rect } of measurements) {
      if (rect.bottom < edge.top || rect.top - (bottom - start) > edge.bottom) continue
      const before = snapshot.blocks.get(node.dataset.conversationBlock!)
      if (before === undefined) {
        this.play(node, [{ opacity: 0 }, { opacity: 1 }])
      } else if (rect.height > before.height + 1) {
        // Consecutive prose may be merged into an existing block. Reveal its new
        // lower edge without fading the already readable text or scaling glyphs.
        const hidden = Math.min(rect.height - before.height, viewport.clientHeight)
        this.play(node, [{ clipPath: `inset(0px 0px ${hidden}px 0px)` }, { clipPath: 'inset(0px)' }])
      }
    }
    if (bottom !== start) {
      this.target = bottom
      const began = performance.now()
      const tick = (now: number): void => {
        if (this.target === null) return
        // rAF timestamps describe the frame start, which can precede this commit.
        const progress = Math.max(0, Math.min(1, (now - began) / conversationMotion.duration))
        const eased = 1 - (1 - progress) ** 3
        viewport.scrollTop = start + (this.target - start) * eased
        if (progress < 1) this.frame = requestAnimationFrame(tick)
        else this.finish()
      }
      this.frame = requestAnimationFrame(tick)
    }
    if (this.target !== null || this.animations.size) {
      // Background windows must not retain a stale clip or a pending scroll.
      this.deadline = window.setTimeout(this.finish, conversationMotion.duration)
    }
  }

  private blocks(): HTMLElement[] {
    return Array.from(this.content.current?.querySelectorAll<HTMLElement>('[data-conversation-block]') ?? [])
  }

  private bottom(): number {
    return this.viewport ? Math.max(0, this.viewport.scrollHeight - this.viewport.clientHeight) : 0
  }

  private toLatest(): void {
    if (this.viewport && this.props.active && this.props.follow) this.viewport.scrollTop = this.bottom()
  }

  private play(node: HTMLElement, frames: Keyframe[]): void {
    if (typeof node.animate !== 'function') return
    this.animations.add(node.animate(frames, {
      duration: conversationMotion.duration, easing: conversationMotion.easing, fill: 'both'
    }))
  }

  private stop = (): void => {
    if (this.frame !== null) cancelAnimationFrame(this.frame)
    if (this.deadline !== null) window.clearTimeout(this.deadline)
    this.frame = null
    this.deadline = null
    this.target = null
    for (const animation of this.animations) animation.cancel()
    this.animations.clear()
  }

  private finish = (): void => {
    if (this.target !== null && this.viewport) this.viewport.scrollTop = this.target
    this.stop()
  }

  private reduceMotion = (): void => {
    if (this.preference?.matches) this.finish()
  }

  private interrupt = (): void => {
    this.stop()
  }

  render(): JSX.Element {
    const { revision: _revision, contextKey: _contextKey, follow: _follow, active: _active,
      viewportRef: _viewportRef, children, onScroll, onWheel, onTouchStart, onPointerDown, onKeyDown, ...props } = this.props
    return <Scroll {...props} ref={this.setViewport}
      onScroll={event => {
        if (this.target !== null) return
        onScroll?.(event)
      }}
      onWheel={event => { this.interrupt(); onWheel?.(event) }}
      onTouchStart={event => { this.interrupt(); onTouchStart?.(event) }}
      onPointerDown={event => { this.interrupt(); onPointerDown?.(event) }}
      onKeyDown={event => {
        if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) this.interrupt()
        onKeyDown?.(event)
      }}
    ><Content ref={this.content}>{children}</Content></Scroll>
  }
}

export const ConversationFeed = forwardRef<HTMLDivElement, Props>(function ConversationFeed({ active = true, ...props }, ref) {
  return <Feed {...props} active={active} viewportRef={ref} />
})
