/** A short send field. Input, send state and auto-growth come as one set, so no screen computes dimensions. */
import { useEffect, useRef, type ReactNode } from 'react'
import { styled } from '@mui/material/styles'
import { Column } from '../layout/Stack.js'
import { feedbackMetrics } from '../../theme/feedback.js'

const MAX_HEIGHT = feedbackMetrics.composer.compactHeight

const Pill = styled('div')(({ theme }) => ({
  display: 'flex',
  alignItems: 'flex-end',
  gap: theme.spacing(1),
  padding: theme.spacing(1),
  paddingLeft: theme.spacing(2),
  borderRadius: theme.radius.lg,
  border: `1px solid ${theme.palette.border.strong}`,
  background: theme.palette.surface.raised
}))

const Input = styled('textarea')(({ theme }) => ({
  flex: '1 1 auto',
  minWidth: 0,
  // Matched to the circle's height so that a single line lands vertically centred
  padding: `${theme.spacing(1)} 0`,
  border: 0,
  outline: 'none',
  resize: 'none',
  background: 'transparent',
  color: theme.palette.text.primary,
  fontFamily: theme.typography.fontFamily,

  fontSize: theme.typography.body1.fontSize,
  lineHeight: String(theme.typography.body1.lineHeight),
  maxHeight: MAX_HEIGHT,
  overflowY: 'auto',
  WebkitAppearance: 'none'
}))

const Send = styled('button', { shouldForwardProp: (p) => p !== 'active' })<{ active: boolean }>(
  ({ theme, active }) => ({
    flex: '0 0 auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: theme.density.control.xs,
    height: theme.density.control.xs,
    border: 0,
    borderRadius: theme.radius.full,
    background: active ? theme.palette.primary.main : theme.palette.surface.hover,
    color: active ? theme.palette.text.inverse : theme.palette.text.tertiary,
    cursor: active ? 'pointer' : 'default',
    transition: `background ${feedbackMetrics.motion.pressMs}ms ease-out`,
    '&:active': active ? { background: theme.palette.primary.dark } : {}
  })
)

export interface CompactComposerProps {
  value: string
  onChange(next: string): void
  onSend(): void

  placeholder: string
  disabled?: boolean
  sendIcon: ReactNode
  sendLabel: string
}

export function CompactComposer({
  value,
  onChange,
  onSend,
  placeholder,
  disabled,
  sendIcon,
  sendLabel
}: CompactComposerProps): JSX.Element {
  const input = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = input.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`
  }, [value])

  const ready = !disabled && value.trim().length > 0

  return (
    <Column gap={1} sx={{ px: 2, py: 1.5 }}>
      <Pill>
        <Input
          ref={input}
          rows={1}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
        <Send
          type="button"
          active={ready}
          disabled={!ready}
          aria-label={sendLabel}
          onClick={() => ready && onSend()}
        >
          {sendIcon}
        </Send>
      </Pill>
    </Column>
  )
}
