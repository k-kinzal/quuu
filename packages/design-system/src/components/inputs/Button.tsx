import { forwardRef, useId, type ReactNode } from 'react'
import MuiButton, { type ButtonProps } from '@mui/material/Button'
import MuiIconButton, { type IconButtonProps as MuiIconButtonProps } from '@mui/material/IconButton'
import { ControlTooltip } from '../utils/ControlTooltip.js'
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
  /** Identifies a menu trigger. Its tooltip closes before the menu opens. */
  menu?: boolean
}

/** A glyph-only button, for actions pressed over and over. */
export function IconButton({
  title,
  icon,
  menu,
  ...rest
}: IconButtonProps): JSX.Element {
  const generatedId = useId()
  const buttonId = rest.id ?? generatedId
  return (
    <ControlTooltip title={title} disabledSupport>
      <MuiIconButton
        aria-label={title}
        // Tell screen readers too what pressing does (a menu opens)
        aria-haspopup={menu ? 'menu' : undefined}
        {...rest}
        id={buttonId}
        loadingIndicator={rest.loadingIndicator ?? <LoadingProgress labelledBy={buttonId} />}
      >
        {icon}
      </MuiIconButton>
    </ControlTooltip>
  )
}

/**
 * A text-only button. Placed next to a value to say "you can change / open it here".
 * It has no frame, so it does not thin out the density of a surface full of attributes.
 */
export { LinkButton } from './LinkButton.js'
