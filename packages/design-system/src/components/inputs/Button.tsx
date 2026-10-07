import { forwardRef, useId, type ReactNode } from 'react'
import MuiButton, { type ButtonProps } from '@mui/material/Button'
import MuiIconButton, { type IconButtonProps as MuiIconButtonProps } from '@mui/material/IconButton'
import { keyframes, styled } from '@mui/material/styles'
import { ControlTooltip } from '../utils/ControlTooltip.js'
import { LoadingProgress } from '../feedback/LoadingDots.js'

export type { ButtonProps } from '@mui/material/Button'

const rotate = keyframes({ to: { transform: 'rotate(360deg)' } })
const RotatingProgress = styled('span')({
  display: 'flex',
  animation: `${rotate} 1s linear infinite`,
  '& svg': { display: 'block' },
  '@media (prefers-reduced-motion: reduce)': { animation: 'none' }
})

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
  /** Rotate the action's glyph when it also represents ongoing work. */
  loadingAnimation?: 'dots' | 'rotate'
  /** Identifies a menu trigger. Its tooltip closes before the menu opens. */
  menu?: boolean
}

/** A glyph-only button, for actions pressed over and over. */
export function IconButton({
  title,
  icon,
  menu,
  loadingAnimation = 'dots',
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
        loadingIndicator={rest.loadingIndicator ?? (loadingAnimation === 'rotate'
          ? <RotatingProgress role="progressbar" aria-labelledby={buttonId}><span aria-hidden="true">{icon}</span></RotatingProgress>
          : <LoadingProgress labelledBy={buttonId} />)}
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
