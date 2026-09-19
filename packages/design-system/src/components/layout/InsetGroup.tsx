import { styled, type Theme, type CSSObject } from '@mui/material/styles'
import { blockProps } from '../../theme/styled.js'
import { Column, Row } from './Stack.js'
import { Text } from '../data-display/Text.js'

/** Arranging the group belongs to the caller; the frame, the row boundaries and how input and display line up belong here. */
export const InsetGroupFrame = styled('div')(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  margin: `0 ${theme.spacing(4)}`,
  borderRadius: theme.radius.lg,
  background: theme.palette.surface.default,
  overflow: 'hidden'
}))
export const InsetGroupSection = styled(Column)(({ theme }) => ({
  gap: theme.spacing(1),
  paddingTop: theme.spacing(3)
}))
export const InsetGroupHeading = styled(Row)(({ theme }) => ({ padding: `0 ${theme.spacing(5)}` }))
export const InsetGroupNote = styled(Text)(({ theme }) => ({ padding: `0 ${theme.spacing(5)}` }))

/** The boundary's starting point comes from the glyph width plus the padding, so the caller never computes 56px. */
const row = (theme: Theme, pressable: boolean, marker?: boolean): CSSObject => ({
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(2),
  width: '100%',
  minHeight: theme.density.row.xl,
  padding: `${theme.spacing(2)} ${theme.spacing(4)}`,
  border: 0,
  background: 'transparent',
  color: theme.palette.text.primary,
  textAlign: 'left',
  font: 'inherit',
  cursor: pressable ? 'pointer' : 'default',
  ...(pressable ? { '&:active': { background: theme.palette.surface.hover } } : {}),
  '&:not(:last-child)::after': {
    content: '""',
    position: 'absolute',
    left: marker ? `calc(${theme.spacing(6)} + ${theme.iconSize.lg}px)` : theme.spacing(4),
    right: 0,
    bottom: 0,
    height: 1,
    background: theme.palette.border.subtle
  }
})
export const InsetStaticRow = styled('div', { shouldForwardProp: blockProps('marker') })<{
  marker?: boolean
}>(({ theme, marker }) => row(theme, false, marker))
export const InsetPressRow = styled('button', { shouldForwardProp: blockProps('marker') })<{
  marker?: boolean
}>(({ theme, marker }) => ({
  ...row(theme, true, marker),
  '&:disabled': { color: theme.palette.text.tertiary, cursor: 'default' }
}))
export const InsetFieldRow = styled('label')(({ theme }) => ({
  ...row(theme, false),
  cursor: 'text'
}))
