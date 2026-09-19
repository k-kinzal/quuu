import { forwardRef, useId, type ReactNode } from 'react'
import MuiButton, { type ButtonProps } from '@mui/material/Button'
import MuiIconButton, { type IconButtonProps as MuiIconButtonProps } from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import { LoadingProgress } from '../feedback/LoadingDots.js'

export type { ButtonProps } from '@mui/material/Button'

/** Keep MUI's control and ref behavior while naming the loading mark after its action. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { id, loadingIndicator, ...props }, ref
) {
  const generatedId = useId()
  const buttonId = id ?? generatedId
  return <MuiButton {...props} id={buttonId} ref={ref}
    loadingIndicator={loadingIndicator ?? <LoadingProgress labelledBy={buttonId} />} />
}) as typeof MuiButton

export interface IconButtonProps extends Omit<MuiIconButtonProps, 'children' | 'title'> {
  /**
   * What the button does.
   *
   * With an icon-only button, people read the glyph differently from one another.
   * The type makes it required, so forgetting it fails at compile time.
   */
  title: string
  icon: ReactNode
  /** Skip the tooltip and use only the `title` attribute (inside menus and other places where surfaces must not stack) */
  plainTitle?: boolean
  /**
   * A button that opens a menu when pressed.
   *
   * **Put up no bubble at all** (neither a tooltip nor a `title` attribute). The OS
   * draws the menu, and the moment it opens the pointer is still parked on the button.
   * The hover tooltip never receives `mouseleave` so it does not disappear, and **the
   * "tooltip from hovering" and the "menu opened by clicking" end up stacked two deep**
   * (that is what happened).
   *
   * The name is still carried by `aria-label`. What it can do is said by the contents of
   * the menu itself, so there is no need to say it again before opening.
   */
  menu?: boolean
}

/** A glyph-only button, for actions pressed over and over. */
export function IconButton({
  title,
  icon,
  plainTitle,
  menu,
  ...rest
}: IconButtonProps): JSX.Element {
  const generatedId = useId()
  const buttonId = rest.id ?? generatedId
  const button = (
    <MuiIconButton
      aria-label={title}
      // Tell screen readers too what pressing does (a menu opens)
      aria-haspopup={menu ? 'menu' : undefined}
      title={plainTitle && !menu ? title : undefined}
      {...rest}
      id={buttonId}
      loadingIndicator={rest.loadingIndicator ?? <LoadingProgress labelledBy={buttonId} />}
    >
      {icon}
    </MuiIconButton>
  )
  if (plainTitle || menu) return button
  return (
    <Tooltip title={title}>
      <span style={{ display: 'inline-flex' }}>{button}</span>
    </Tooltip>
  )
}

/**
 * A text-only button. Placed next to a value to say "you can change / open it here".
 * It has no frame, so it does not thin out the density of a surface full of attributes.
 */
export { LinkButton } from './LinkButton.js'
