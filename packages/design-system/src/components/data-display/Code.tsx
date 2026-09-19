import { styled } from '@mui/material/styles'
import { blockProps } from '../../theme/styled.js'

/** Short code mixed into prose. A background sets it apart from the body. */
export const Code = styled('code')(({ theme }) => ({
  fontFamily: theme.typography.fontFamilyMono,
  fontSize: 10,
  padding: '1px 4px',
  borderRadius: 3,
  background: theme.palette.surface.raised
}))

/** Raw output. Its length is unknowable, so a max height is set and only that scrolls. */
export const CodeBlock = styled('pre', { shouldForwardProp: blockProps('tone', 'maxHeight') })<{
  tone?: 'default' | 'danger'
  maxHeight?: number
}>(({ theme, tone = 'default', maxHeight = 280 }) => ({
  margin: 0,
  padding: theme.spacing(2),
  borderLeft: `1px solid ${theme.palette.border.subtle}`,
  fontFamily: theme.typography.fontFamilyMono,
  ...theme.typography.caption,
  maxHeight,
  overflow: 'auto',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  userSelect: 'text',
  color: tone === 'danger' ? theme.palette.error.main : theme.palette.text.secondary,
  background: theme.palette.surface.canvas
}))

/** A key's notation. Used mixed into a label. */
export const Kbd = styled('span')(({ theme }) => ({
  fontSize: 10,
  fontFamily: theme.typography.fontFamilyMono,
  color: theme.palette.text.tertiary,
  opacity: 0.9
}))

/** A framed key notation. Shows a pressable key at the right edge of a row or in a footer. */
export const KeyCap = styled('span')(({ theme }) => ({
  flex: '0 0 auto',
  padding: '1px 6px',
  border: `1px solid ${theme.palette.border.subtle}`,
  borderRadius: theme.radius.sm,
  fontSize: 10,
  fontFamily: theme.typography.fontFamilyMono,
  color: theme.palette.text.tertiary
}))
