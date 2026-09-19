import type { ReactNode } from 'react'
import { styled, type Theme } from '@mui/material/styles'
import { X } from 'lucide-react'
import { blockProps, canHover, riseIn } from '../../theme/styled.js'
import { useStrings } from '../../theme/strings.js'
import { footerBandHeight } from '../layout/Panel.js'
import { Text } from '../data-display/Text.js'

export type ToastTone = 'info' | 'success' | 'warning' | 'danger'

export interface ToastSpec {
  id: string
  tone: ToastTone
  message: string
  detail?: string
}

function toneColor(theme: Theme, tone: ToastTone): string {
  switch (tone) {
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

const StackRoot = styled('div', { shouldForwardProp: blockProps('placement') })<{ placement?: 'viewport' | 'aboveFooter' }>(
  ({ theme, placement = 'viewport' }) => ({
    position: 'fixed',
    right: theme.spacing(3),
    bottom: `calc(${placement === 'aboveFooter' ? footerBandHeight(theme) : 0}px + ${theme.spacing(2)})`,
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(2),
    zIndex: theme.zIndex.snackbar,
    // Do not make the surface under the gap unpressable
    pointerEvents: 'none'
  })
)

const ToastRoot = styled('div', { shouldForwardProp: blockProps('tone') })<{ tone: ToastTone }>(
  ({ theme, tone }) => ({
    pointerEvents: 'auto',
    display: 'flex',
    alignItems: 'flex-start',
    gap: theme.spacing(2),
    minWidth: 240,
    maxWidth: 360,
    padding: `${theme.spacing(2)} ${theme.spacing(3)}`,
    border: `1px solid ${theme.palette.border.strong}`,
    borderLeft: `2px solid ${toneColor(theme, tone)}`,
    borderRadius: theme.radius.md,
    background: theme.palette.surface.raised,
    boxShadow: theme.shadows[8],
    ...theme.typography.body2,
    cursor: 'pointer',
    animation: `${riseIn} ${theme.transitions.duration.short}ms ease-out`
  })
)

const ToastIcon = styled('span', { shouldForwardProp: blockProps('tone') })<{ tone: ToastTone }>(
  ({ theme, tone }) => ({
    display: 'inline-flex',
    paddingTop: 2,
    color: tone === 'info' ? theme.palette.text.tertiary : toneColor(theme, tone)
  })
)

// Sits on the toast's own padding so the glyph lines up with the first line of text without
// pushing that line in, and the pressable area still spans a full step.
const DismissButton = styled('button')(({ theme }) => ({
  display: 'inline-grid', placeItems: 'center', flex: '0 0 auto',
  width: theme.iconButton.xs, height: theme.iconButton.xs, padding: 0,
  marginRight: `-${theme.spacing(1)}`,
  border: 0, borderRadius: theme.radius.sm, background: 'transparent',
  color: theme.palette.text.tertiary, cursor: 'pointer',
  '& svg': { width: theme.iconSize.sm, height: theme.iconSize.sm },
  [canHover]: { '&:hover': { background: theme.palette.surface.selected, color: theme.palette.text.primary } },
  '&:focus-visible': { outline: `2px solid ${theme.palette.primaryText}`, outlineOffset: -2 }
}))

export interface ToastStackProps<T extends ToastSpec> {
  toasts: readonly T[]
  /** The glyph per kind. Pass nothing and only the word is shown, with no glyph */
  icon?(tone: ToastTone): ReactNode
  /** Placement that avoids the bottom band. It uses the same source as the band and never asks the caller for a height */
  placement?: 'viewport' | 'aboveFooter'
  onSelect(toast: T): void
  /**
   * Clear a toast without following it. Pass it and every toast gets a close glyph;
   * leave it out and a press (with wherever that leads) is the only way to make one go.
   */
  onDismiss?(toast: T): void
}

/**
 * Notifications that stack up.
 *
 * Color and glyph alone do not say what happened, so **a word is always included**.
 * Where a press leads is the caller's decision (a notification is an entrance, not a
 * conclusion). Because a press leads somewhere, **taking a notice off the screen must not
 * require going there** — a person who has read a failure and wants nothing more than
 * to keep their place gets the close glyph.
 */
export function ToastStack<T extends ToastSpec>({
  toasts,
  icon,
  placement,
  onSelect,
  onDismiss
}: ToastStackProps<T>): JSX.Element {
  const strings = useStrings()
  return (
    <StackRoot placement={placement}>
      {toasts.map((toast) => (
        <ToastRoot key={toast.id} tone={toast.tone} onClick={() => onSelect(toast)} role="status">
          {icon && <ToastIcon tone={toast.tone}>{icon(toast.tone)}</ToastIcon>}
          <Text sx={{ flex: 1 }}>
            {toast.message}
            {toast.detail && (
              <Text block size="xs" tone="tertiary" sx={{ mt: '2px', wordBreak: 'break-word' }}>
                {toast.detail}
              </Text>
            )}
          </Text>
          {onDismiss && (
            <DismissButton
              type="button"
              aria-label={strings.toast.dismiss}
              title={strings.toast.dismiss}
              onClick={(event) => {
                event.stopPropagation()
                onDismiss(toast)
              }}
            >
              <X aria-hidden="true" />
            </DismissButton>
          )}
        </ToastRoot>
      ))}
    </StackRoot>
  )
}
