import Collapse from '@mui/material/Collapse'
import useMediaQuery from '@mui/material/useMediaQuery'
import { styled } from '@mui/material/styles'
import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { layoutMotion } from '../../theme/tokens.js'

const Root = styled(Collapse)({ flex: '0 0 auto', minWidth: 0 })
type Content = ReactNode | (() => ReactNode)

// Formatting large code or log bodies must remain lazy while the disclosure is closed.
function Body({ content }: { content: Content }): JSX.Element {
  return <>{typeof content === 'function' ? content() : content}</>
}

/** An inline disclosure opens along the reading direction without keeping hidden content active. */
export function Reveal({ open, children }: { open: boolean; children: Content }): JSX.Element {
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  const body = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    const active = document.activeElement
    if (open && active instanceof HTMLElement && !body.current?.contains(active)) trigger.current = active
    if (!open && body.current?.contains(active)) trigger.current?.focus()
    if (body.current) body.current.inert = !open
  }, [open])
  return (
    <Root in={open} timeout={reduced ? 0 : layoutMotion.duration} easing={layoutMotion.easing} mountOnEnter unmountOnExit>
      <div ref={body} aria-hidden={!open || undefined}><Body content={children} /></div>
    </Root>
  )
}
