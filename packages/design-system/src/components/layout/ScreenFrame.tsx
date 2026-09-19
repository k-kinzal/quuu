import { styled } from '@mui/material/styles'
import { blockProps } from '../../theme/styled.js'
import { Column, Row } from './Stack.js'

/** A surface that carries the OS safe area. Which screens use the top and bottom bands is assembled by the caller. */
export const ScreenFrame = styled(Column)(({ theme }) => ({
  position: 'fixed',
  inset: 0,
  gap: 0,
  background: theme.palette.surface.canvas,
  color: theme.palette.text.primary
}))
export const SafeHeader = styled(Column)(({ theme }) => ({
  flex: '0 0 auto',
  gap: 0,
  paddingTop: 'env(safe-area-inset-top)',
  borderBottom: `1px solid ${theme.palette.border.subtle}`,
  background: theme.palette.surface.subtle
}))
export const SafeFooter = styled(Column)(({ theme }) => ({
  flex: '0 0 auto',
  gap: 0,
  paddingBottom: 'env(safe-area-inset-bottom)',
  borderTop: `1px solid ${theme.palette.border.subtle}`,
  background: theme.palette.surface.subtle
}))
export const ScreenContent = styled(Column)({
  flex: '1 1 auto',
  gap: 0,
  minHeight: 0,
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  WebkitOverflowScrolling: 'touch'
})
export const TitleBand = styled(Row, { shouldForwardProp: blockProps('large') })<{
  large?: boolean
}>(({ theme, large }) => ({
  minHeight: large ? undefined : theme.density.row.lg,
  padding: large
    ? `${theme.spacing(1)} ${theme.spacing(2)} ${theme.spacing(1.5)}`
    : `${theme.spacing(0.5)} ${theme.spacing(1)}`,
  alignItems: large ? 'flex-end' : 'center',
  gap: theme.spacing(large ? 2 : 1)
}))
export const TitleAction = styled(Row, { shouldForwardProp: blockProps('end') })<{ end?: boolean }>(
  ({ theme, end }) => ({
    flex: '0 0 auto',
    minWidth: theme.density.control.sm,
    gap: 0,
    justifyContent: end ? 'flex-end' : 'flex-start'
  })
)
