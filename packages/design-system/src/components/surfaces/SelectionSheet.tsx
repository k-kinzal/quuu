/** The surface that opens a choice from below. The result is handed over only after the closing animation ends, so the contents do not jump on open and close. */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import Modal from '@mui/material/Modal'
import { keyframes, styled } from '@mui/material/styles'
import { Text } from '../data-display/Text.js'
import { feedbackMetrics } from '../../theme/feedback.js'
import { useStrings } from '../../theme/strings.js'

const fadeIn = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } })
const fadeOut = keyframes({ from: { opacity: 1 }, to: { opacity: 0 } })
const riseIn = keyframes({ from: { transform: 'translateY(100%)' }, to: { transform: 'none' } })
const fallOut = keyframes({ from: { transform: 'none' }, to: { transform: 'translateY(100%)' } })

const CLOSE_MS = feedbackMetrics.motion.slideMs

const Backdrop = styled('div', { shouldForwardProp: (p) => p !== 'closing' })<{
  closing: boolean
}>(({ theme, closing }) => ({
  position: 'fixed',
  inset: 0,
  zIndex: 20,
  background: theme.palette.surface.overlay,
  animation: `${closing ? fadeOut : fadeIn} ${CLOSE_MS}ms ease-out both`,
  '@media (prefers-reduced-motion: reduce)': { animation: 'none' }
}))

const Panel = styled('div', { shouldForwardProp: (p) => p !== 'closing' })<{ closing: boolean }>(
  ({ theme, closing }) => ({
    position: 'fixed',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 21,
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(2),
    padding: `${theme.spacing(2)} ${theme.spacing(3)}`,
    paddingBottom: `calc(${theme.spacing(3)} + env(safe-area-inset-bottom))`,
    // Do not stretch to the top edge. The surface visible behind it is what signals "this one is temporary"
    maxHeight: `calc(100% - env(safe-area-inset-top) - ${theme.density.control.md}px)`,

    animation: `${closing ? fallOut : riseIn} ${CLOSE_MS}ms ${feedbackMetrics.motion.ease} both`,
    '@media (prefers-reduced-motion: reduce)': { animation: 'none' }
  })
)

const Card = styled('div')(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  borderRadius: theme.radius.lg,
  background: theme.palette.surface.raised,
  // When the options do not fit the screen, scroll inside (never push the whole surface off-screen)
  overflow: 'auto',
  overscrollBehavior: 'contain'
}))

const Item = styled('button')(({ theme }) => ({
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(2),
  width: '100%',
  minHeight: theme.density.control.sm,
  padding: `${theme.spacing(2)} ${theme.spacing(3)}`,
  border: 0,
  background: 'transparent',
  color: theme.palette.text.primary,
  font: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
  '&:active': { background: theme.palette.surface.hover },
  '&:not(:last-child)::after': {
    content: '""',
    position: 'absolute',
    left: theme.spacing(3),
    right: 0,
    bottom: 0,
    height: 1,
    background: theme.palette.border.subtle
  }
}))

export interface SelectionSheetOption<T> {
  value: T
  label: string

  count?: number
}

export interface SelectionSheetProps<T> {
  options: ReadonlyArray<SelectionSheetOption<T>>

  isSelected(value: T): boolean
  onSelect(value: T): void
  onClose(): void
  selectedIcon: ReactNode
  closeLabel: string
  label?: string
}

export function SelectionSheet<T>({
  options,
  isSelected,
  onSelect,
  onClose,
  selectedIcon,
  closeLabel,
  label
}: SelectionSheetProps<T>): JSX.Element {
  const strings = useStrings()
  const sheetLabel = label ?? strings.selectionSheet.label
  const [closing, setClosing] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Let the closing animation play out before removing it. Removed at once, it does not read as "withdrawn"
  const close = (then?: () => void): void => {
    if (timer.current !== null) return
    setClosing(true)
    timer.current = setTimeout(() => {
      then?.()
      onClose()
    }, CLOSE_MS)
  }

  useEffect(() => {
    return () => {
      if (timer.current !== null) clearTimeout(timer.current)
    }
  }, [])

  return (
    <Modal open onClose={() => close()} hideBackdrop>
      <div>
        <Backdrop closing={closing} onClick={() => close()} />
        {/* Modal isolates the controls and the focus behind it, and on close returns to the entrance you pressed. */}
        <Panel closing={closing} role="dialog" aria-modal="true" aria-label={sheetLabel}>
          <Card>
            {options.map((option, i) => (
              <Item
                key={i}
                type="button"
                onClick={() => close(() => onSelect(option.value))}
                aria-current={isSelected(option.value) || undefined}
              >
                <Text grow>{option.label}</Text>
                {option.count !== undefined && (
                  <Text size="sm" tone="tertiary" tabular>
                    {option.count}
                  </Text>
                )}
                <Mark>{isSelected(option.value) ? selectedIcon : null}</Mark>
              </Item>
            ))}
          </Card>
          <Card>
            <Item type="button" onClick={() => close()}>
              <Text grow align="center" tone="accent">
                {closeLabel}
              </Text>
            </Item>
          </Card>
        </Panel>
      </div>
    </Modal>
  )
}

const Mark = styled('span')(({ theme }) => ({
  flex: '0 0 auto',
  width: theme.iconSize.md,
  display: 'inline-flex',
  alignItems: 'center',
  color: theme.palette.primaryText
}))
