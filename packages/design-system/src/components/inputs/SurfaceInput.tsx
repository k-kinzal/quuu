/** An input that leaves the frame to its parent surface. The body size comes from the density, so it does not shrink on touch devices alone. */
import { styled, type CSSObject, type Theme } from '@mui/material/styles'

function field(theme: Theme): CSSObject {
  return {
    width: '100%',
    margin: 0,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.body1.fontSize,
    lineHeight: String(theme.typography.body1.lineHeight),
    color: theme.palette.text.primary,
    background: 'transparent',
    border: 0,
    padding: 0,
    outline: 'none',
    // An iOS text field draws rounded corners and a shadow by default. Removed to match the surface's conventions
    WebkitAppearance: 'none',
    // An unfilled field is demoted until it reads as a draft (the same rank as a heading)
    '&::placeholder': { color: theme.palette.text.tertiary, opacity: 1 }
  }
}

const Line = styled('input')(({ theme }) => field(theme))

const Area = styled('textarea')(({ theme }) => ({
  ...field(theme),
  // No grab-to-resize corner (a dimension changing inside a surface is not part of the iOS idiom)
  resize: 'none'
}))

export function SurfaceTextLine({
  value,
  onChange,
  placeholder,
  autoFocus
}: {
  value: string
  onChange(next: string): void
  placeholder?: string
  autoFocus?: boolean
}): JSX.Element {
  return (
    <Line
      type="text"
      value={value}
      autoFocus={autoFocus}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

export function SurfaceTextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
  autoFocus
}: {
  value: string
  onChange(next: string): void
  placeholder?: string
  rows?: number
  autoFocus?: boolean
}): JSX.Element {
  return (
    <Area
      value={value}
      rows={rows}
      autoFocus={autoFocus}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}
