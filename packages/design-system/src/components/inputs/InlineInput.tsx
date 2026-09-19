import type { InputHTMLAttributes, ReactNode } from 'react'
import { alpha, styled } from '@mui/material/styles'
import { blockProps } from '../../theme/styled.js'
import { lineHeight } from '../../theme/tokens.js'

/**
 * An input that fixes an existing value in place.
 *
 * No frame; only the hover and focus background changes say "this can be edited".
 * For places where **what was being displayed becomes the input as-is**, like titles and names.
 */
export const InlineInput = styled('input', { shouldForwardProp: blockProps('scale') })<{
  /** `size` is an HTML attribute of input, so this takes another name */
  scale?: 'sm' | 'md' | 'lg'
}>(({ theme, scale = 'lg' }) => ({
  flex: '1 1 auto',
  minWidth: 0,
  height: theme.density.control.sm,
  padding: '2px 4px',
  border: 0,
  borderRadius: theme.radius.sm,
  background: 'transparent',
  fontFamily: 'inherit',
  fontSize:
    scale === 'lg'
      ? theme.typography.subtitle2.fontSize
      : scale === 'md'
        ? theme.typography.body1.fontSize
        : theme.typography.body2.fontSize,
  fontWeight: scale === 'lg' ? 600 : 400,
  lineHeight: 1.4,
  // Designed as a single line, so no wrapping. The full text escapes to title
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  '&:hover': { background: theme.palette.surface.default },
  '&:focus': {
    background: theme.palette.surface.default,
    outline: `1px solid ${theme.palette.primaryText}`
  }
}))

/**
 * A bare input placed inside a vessel.
 *
 * State (focus rule and background) belongs to the vessel, so this carries no
 * decoration at all. The inside of the search box, one-line add, and command input.
 */
export const PlainInput = styled('input', { shouldForwardProp: blockProps('textSize') })<{
  /** `size` is an HTML attribute of input, so this takes another name */
  textSize?: 'sm' | 'md' | 'lg'
}>(({ theme, textSize = 'sm' }) => ({
  flex: '1 1 auto',
  minWidth: 0,
  border: 0,
  padding: 0,
  background: 'transparent',
  outline: 'none',
  fontFamily: 'inherit',
  fontSize:
    textSize === 'lg'
      ? 16
      : textSize === 'md'
        ? theme.typography.body1.fontSize
        : theme.typography.body2.fontSize,
  color: theme.palette.text.primary,
  '&::placeholder': { color: theme.palette.text.tertiary },
  '&::-webkit-search-cancel-button': { appearance: 'none' }
}))

/** Colors for a quote surface. Vocabulary aligned with the read-only `Quote`. */
export type EditorTone = 'plain' | 'neutral' | 'info' | 'warning'

/**
 * A prose surface edited in place.
 *
 * Being a prose surface it shows no scrollbar and grows to its content
 * (the caller tracks the height as the value changes).
 *
 * State follows the inline-rank rules: **hover changes the background, focus draws
 * the rule**. The body sits in the same shape as a quote, so without the rule,
 * "writing right now" would be only a difference in background depth —
 * indistinguishable from a read-only surface.
 */
export const AutoTextArea = styled('textarea', { shouldForwardProp: blockProps('tone') })<{
  tone?: EditorTone
}>(({ theme, tone = 'plain' }) => {
  const accent =
    tone === 'warning'
      ? theme.palette.warning.main
      : tone === 'info'
        ? theme.palette.info.main
        : theme.palette.border.strong

  const frame =
    tone === 'plain'
      ? {
          // Keep the rule off the body text, pushed outward (this surface has no padding)
          padding: 0,
          outlineOffset: 4,
          borderRadius: theme.radius.sm,
          background: 'transparent',
          fontSize: theme.typography.body1.fontSize,
          lineHeight: lineHeight.read
        }
      : tone === 'neutral'
        ? {
            padding: theme.spacing(3),
            borderLeft: `2px solid ${accent}`,
            borderRadius: `0 ${theme.radius.md}px ${theme.radius.md}px 0`,
            background: theme.palette.surface.default,
            fontSize: theme.typography.body1.fontSize,
            lineHeight: lineHeight.read
          }
        : {
            padding: theme.spacing(2),
            borderLeft: `2px solid ${accent}`,
            background: alpha(accent, 0.08),
            fontSize: theme.typography.body2.fontSize,
            lineHeight: theme.typography.body2.lineHeight
          }

  return {
    display: 'block',
    width: '100%',
    margin: 0,
    border: 0,
    resize: 'none',
    overflow: 'hidden',
    fontFamily: 'inherit',
    color: theme.palette.text.primary,
    outline: 'none',
    transition: `background ${theme.transitions.duration.shortest}ms ease-out`,
    ...frame,
    '&::placeholder': { color: theme.palette.text.tertiary },
    '&:hover:not(:disabled)': { background: theme.palette.surface.hover },
    '&:focus': {
      background: theme.palette.surface.raised,
      outline: `1px solid ${theme.palette.primaryText}`
    },
    '&:disabled': { color: theme.palette.text.secondary, cursor: 'default' }
  }
})

const SearchRoot = styled('label', { shouldForwardProp: blockProps('width', 'fill') })<{
  width?: number
  fill?: boolean
}>(
  ({ theme, width = 240, fill }) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    width: fill ? '100%' : width,
    height: theme.density.control.xs + 2,
    padding: `0 ${theme.spacing(3)}`,
    borderRadius: theme.radius.full,
    border: `1px solid ${theme.palette.border.subtle}`,
    background: theme.palette.surface.default,
    color: theme.palette.text.tertiary,
    '&:focus-within': {
      borderColor: theme.palette.primaryText,
      color: theme.palette.text.secondary
    }
  })
)

export interface SearchInputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: ReactNode
  width?: number
  fill?: boolean
}

/** The search box. The vessel holds state (focus); the input inside stays bare. */
export function SearchInput({ icon, width, fill, ...rest }: SearchInputProps): JSX.Element {
  return (
    <SearchRoot width={width} fill={fill}>
      {icon}
      <PlainInput type="search" {...rest} />
    </SearchRoot>
  )
}

/**
 * A list row that has become an input.
 *
 * A demoted intake that keeps a second primary input (`Composer`) off the screen.
 * It accepts only a name; the content is written after opening.
 */
export const InlineAddRow = styled('div')(({ theme }) => ({
  flex: '0 0 auto',
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(2),
  height: 32,
  padding: `0 ${theme.spacing(3)}`,
  background: theme.palette.surface.raised,
  borderBottom: `1px solid ${theme.palette.border.subtle}`,
  boxShadow: `inset 2px 0 0 ${theme.palette.primaryText}`
}))
