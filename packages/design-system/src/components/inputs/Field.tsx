import type { ReactNode } from 'react'
import { styled, type SxProps, type Theme } from '@mui/material/styles'
import { blockProps } from '../../theme/styled.js'

/**
 * A label + input + hint set.
 *
 * For inputs that should line up as a form, like settings and definitions.
 * A different rank from in-place edits (`InlineInput`) and the primary-act input
 * (`Composer`) — don't mix them.
 */
const FieldRoot = styled('div')(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  // Label and input are one set. The gap between sets (16px) is wider than within one (6px)
  gap: 6,
  marginBottom: theme.spacing(4)
}))

const Label = styled('label')(({ theme }) => ({
  ...theme.typography.body2,
  color: theme.palette.text.secondary,
  fontWeight: 500
}))

/** The hint. Sits below the input. `code` gets a monospaced, backed treatment. */
export const FieldHint = styled('div', { shouldForwardProp: blockProps('tone') })<{
  tone?: 'default' | 'danger'
}>(({ theme, tone = 'default' }) => ({
  ...theme.typography.caption,
  color: tone === 'danger' ? theme.palette.error.main : theme.palette.text.tertiary,
  '& code': {
    fontFamily: theme.typography.fontFamilyMono,
    fontSize: 10,
    padding: '1px 4px',
    borderRadius: 3,
    background: theme.palette.surface.raised
  }
}))

/**
 * Input widths. **Chosen by the value's character. No per-screen px.**
 *
 * When free numbers were accepted, identical "name" fields came out 320 and 360,
 * identical "number" fields 140, 180 and 200 — steps with no explainable reason
 * once laid side by side. With only 4 steps, whether things line up no longer
 * needs checking by eye.
 */
export const fieldWidth = {
  /** 2-4 digit numbers (concurrency, priority, seconds) */
  xs: 112,
  /** Short words, choices */
  sm: 200,
  /** Names, one-line selects */
  md: 340,
  /** Runs of identifiers like commands and URLs */
  lg: 520,
  /** Things that use the full width, like paths */
  full: undefined
} as const

export type FieldWidth = keyof typeof fieldWidth

export interface FieldProps {
  label: string
  hint?: ReactNode
  /** Why it can't be edited. While shown, the input is disabled too */
  error?: string
  /**
   * The input width. Defaults to `md`.
   * **The default is deliberately not "omitted means full width"** — values of known
   * length would stretch to however wide the window is, and the form stops lining up
   */
  width?: FieldWidth
  sx?: SxProps<Theme>
  children: ReactNode
}

export function Field({
  label,
  hint,
  error,
  width = 'md',
  sx,
  children
}: FieldProps): JSX.Element {
  const max = fieldWidth[width]
  return (
    <FieldRoot sx={sx}>
      <Label>{label}</Label>
      <div style={max !== undefined ? { maxWidth: max } : undefined}>{children}</div>
      {error ? <FieldHint tone="danger">{error}</FieldHint> : hint ? <FieldHint>{hint}</FieldHint> : null}
    </FieldRoot>
  )
}

/** One tier of inputs laid side by side. Top-aligned so the labels line up. */
export const FieldRow = styled('div')(({ theme }) => ({
  display: 'flex',
  alignItems: 'flex-start',
  gap: theme.spacing(2)
}))
