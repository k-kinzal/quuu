import { cloneElement, useRef, useState, type HTMLAttributes, type ReactElement } from 'react'
import Tooltip, { type TooltipProps } from '@mui/material/Tooltip'
import { styled } from '@mui/material/styles'

const DisabledAnchor = styled('span')({
  display: 'inline-flex',
  '& > :disabled': { pointerEvents: 'none' }
})

/** Icon controls own their visible name; callers never have to remember a tooltip wrapper. */
export function ControlTooltip({ title, children, disabledSupport, placement }: {
  title: string
  children: ReactElement<HTMLAttributes<HTMLElement>>
  /** Keep the anchor mounted for controls that can become disabled; never replace a focused button. */
  disabledSupport?: boolean
  placement?: TooltipProps['placement']
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const activated = useRef(false)
  const dismiss = (): void => {
    // Also reject a delayed hover opening after a click has already opened a menu.
    activated.current = true
    setOpen(false)
  }
  const reset = (): void => {
    activated.current = false
    setOpen(false)
  }
  const control = cloneElement(children, {
    'aria-label': children.props['aria-label'] ?? title,
    // A native title would create a second, independently timed bubble.
    title: undefined,
    onPointerDownCapture: event => { dismiss(); children.props.onPointerDownCapture?.(event) },
    onClickCapture: event => { dismiss(); children.props.onClickCapture?.(event) },
    onKeyDownCapture: event => {
      if (['Enter', ' ', 'ArrowDown', 'Escape'].includes(event.key)) dismiss()
      children.props.onKeyDownCapture?.(event)
    },
    onBlur: event => { reset(); children.props.onBlur?.(event) },
    onMouseLeave: event => { reset(); children.props.onMouseLeave?.(event) }
  })
  const expanded = children.props['aria-expanded'] === true || children.props['aria-expanded'] === 'true'
  return <Tooltip title={title} placement={placement} open={open && !expanded}
    onOpen={() => { if (!activated.current) setOpen(true) }} onClose={() => setOpen(false)}
    disableTouchListener slotProps={{ transition: { timeout: 0 } }}>
    {disabledSupport ? <DisabledAnchor>{control}</DisabledAnchor> : control}
  </Tooltip>
}
