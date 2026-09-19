import type { ReactNode } from 'react'
import { alpha, styled, type SxProps, type Theme } from '@mui/material/styles'
import { blockProps } from '../../theme/styled.js'
import { Text } from '../data-display/Text.js'

export type AlertTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral'

function toneColor(theme: Theme, tone: AlertTone): string {
  switch (tone) {
    case 'info':
      return theme.palette.info.main
    case 'success':
      return theme.palette.success.main
    case 'warning':
      return theme.palette.warning.main
    case 'danger':
      return theme.palette.error.main
    default:
      return theme.palette.border.strong
  }
}

const AlertRoot = styled('div', { shouldForwardProp: blockProps('tone') })<{ tone: AlertTone }>(
  ({ theme, tone }) => {
    const color = toneColor(theme, tone)
    return {
      display: 'flex',
      gap: theme.spacing(2),
      padding: theme.spacing(3),
      border: `1px solid ${alpha(color, 0.4)}`,
      borderRadius: theme.radius.md,
      background: tone === 'neutral' ? theme.palette.surface.default : alpha(color, 0.08),
      color
    }
  }
)

export interface AlertProps {
  tone?: AlertTone
  icon?: ReactNode
  title?: string
  /** Only the margin that suits where it sits comes from outside. Nothing else about the look is added */
  sx?: SxProps<Theme>
  children: ReactNode
}

/**
 * A box that draws only trouble and warnings.
 *
 * **Show nothing when things are fine.** Drawing "no problems" makes the difference
 * unreadable when a problem really does show up.
 */
export function Alert({ tone = 'danger', icon, title, sx, children }: AlertProps): JSX.Element {
  return (
    <AlertRoot tone={tone} sx={sx} role="status">
      {icon}
      <div>
        {title && (
          <Text block size="sm" weight="bold" sx={{ mb: '2px' }}>
            {title}
          </Text>
        )}
        <Text
          block
          size="sm"
          tone="secondary"
          leading="read"
          selectable
          sx={{ wordBreak: 'break-word' }}
        >
          {children}
        </Text>
      </div>
    </AlertRoot>
  )
}

/**
 * A short, read-only quote surface. Sets "contents not settled yet" — things held,
 * drafts — apart from the body.
 *
 * Add `clamp` and it folds to a few lines. The full text escapes into `title`.
 */
export const Quote = styled('div', { shouldForwardProp: blockProps('tone', 'clamp') })<{
  tone?: AlertTone
  clamp?: number
}>(({ theme, tone = 'warning', clamp }) => {
  const color = toneColor(theme, tone)
  return {
    padding: theme.spacing(2),
    borderLeft: `2px solid ${color}`,
    background: tone === 'neutral' ? theme.palette.surface.raised : alpha(color, 0.08),
    ...theme.typography.body2,
    whiteSpace: 'pre-wrap',
    userSelect: 'text',
    ...(clamp
      ? {
          display: '-webkit-box',
          WebkitBoxOrient: 'vertical',
          WebkitLineClamp: clamp,
          overflow: 'hidden'
        }
      : {})
  }
})

/**
 * A run of short warnings.
 *
 * Placed just before "the button that sends you to another surface", stating outright
 * whether going is needed. When nothing is paused, not one of them is shown.
 */
export const HintList = styled('ul', { shouldForwardProp: blockProps('tone') })<{
  tone?: AlertTone
}>(({ theme, tone = 'warning' }) => ({
  margin: `${theme.spacing(2)} 0`,
  padding: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing(1),
  '& li': {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 5,
    ...theme.typography.caption,
    color: toneColor(theme, tone)
  },
  '& svg': { flex: '0 0 auto', marginTop: 2 }
}))
