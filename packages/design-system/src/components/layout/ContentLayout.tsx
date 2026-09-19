import { styled } from '@mui/material/styles'
import { blockProps } from '../../theme/styled.js'
import { Column, Row } from './Stack.js'

/** The spacing between body text, notes and actions is chosen by purpose. It removes per-screen margin declarations. */
export const ContentBlock = styled(Column, { shouldForwardProp: blockProps('placement') })<{
  placement?: 'body' | 'notice' | 'groupNotice' | 'actions' | 'footer' | 'section' | 'trailing'
}>(({ theme, placement = 'body' }) => ({
  ...(placement === 'body' ? { padding: theme.spacing(2) } : {}),
  ...(placement === 'notice'
    ? { padding: `${theme.spacing(1.5)} ${theme.spacing(2)}`, textAlign: 'center' }
    : {}),
  ...(placement === 'groupNotice' ? { padding: `${theme.spacing(3)} ${theme.spacing(4)} 0` } : {}),
  ...(placement === 'actions' ? { marginTop: theme.spacing(1) } : {}),
  ...(placement === 'footer' ? { padding: `${theme.spacing(1.5)} ${theme.spacing(2)}` } : {}),
  ...(placement === 'section' ? { paddingBottom: theme.spacing(4) } : {}),
  ...(placement === 'trailing' ? { paddingBottom: theme.spacing(2) } : {})
}))
export const ContentInset = styled('div', { shouldForwardProp: blockProps('space') })<{
  space?: 'paragraph' | 'section' | 'caption'
}>(({ theme, space = 'paragraph' }) => ({
  marginBottom: theme.spacing(space === 'section' ? 4 : space === 'caption' ? 1 : 2)
}))
export const ContentEnd = styled('div')(({ theme }) => ({
  flex: '0 0 auto',
  height: theme.spacing(4)
}))
export const GroupCaption = styled('div')(({ theme }) => ({
  padding: `${theme.spacing(2)} ${theme.spacing(5)}`
}))
export const ActionRow = styled(Row)(({ theme }) => ({ padding: theme.spacing(2) }))
export const ValueColumn = styled('div')({ flex: '0 0 40%', minWidth: 0 })
export const SecondaryLabel = styled('span')({
  flex: '0 0 auto',
  maxWidth: '40%',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
})
