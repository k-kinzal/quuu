import { paneWeights } from '../../layoutSpec.js'
import { styled } from '@mui/material/styles'
import { blockProps, surfaceStyles } from '../../theme/styled.js'

/** An IDE-style work area. The edge navigation, the main surface and the inspector are laid out side by side. */
export const Workbench = styled('div')({
  display: 'flex',
  flex: '1 1 auto',
  minWidth: 0,
  minHeight: 0,
  overflow: 'hidden'
})

/** The container that shows several work panes at once. DOM order is the visual order, as-is. */
export const PaneStack = styled('div', { shouldForwardProp: blockProps('direction') })<{
  direction?: 'horizontal' | 'vertical'
}>(({ direction = 'vertical' }) => ({
  display: 'flex',
  flexDirection: direction === 'vertical' ? 'column' : 'row',
  flex: '1 1 auto',
  minWidth: 0,
  minHeight: 0,
  overflow: 'hidden'
}))

export const WorkbenchPane = styled('section', {
  shouldForwardProp: blockProps('grow', 'surface', 'bordered')
})<{
  grow?: number
  surface?: 'canvas' | 'subtle' | 'default'
  bordered?: 'top' | 'right' | 'bottom' | 'left' | 'none'
}>(({ theme, grow = paneWeights.standard, surface = 'canvas', bordered = 'none' }) => ({
  display: 'flex',
  flexDirection: 'column',
  flex: `${grow} 1 0`,
  minWidth: 0,
  minHeight: 0,
  ...surfaceStyles(theme, surface),
  borderTop: bordered === 'top' ? `1px solid ${theme.palette.border.subtle}` : undefined,
  borderRight: bordered === 'right' ? `1px solid ${theme.palette.border.subtle}` : undefined,
  borderBottom: bordered === 'bottom' ? `1px solid ${theme.palette.border.subtle}` : undefined,
  borderLeft: bordered === 'left' ? `1px solid ${theme.palette.border.subtle}` : undefined
}))

export const WorkbenchPaneHeader = styled('header')(({ theme }) => ({
  height: theme.density.row.md,
  flex: `0 0 ${theme.density.row.md}px`,
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(2),
  padding: `0 ${theme.spacing(2)}`,
  borderBottom: `1px solid ${theme.palette.border.subtle}`,
  background: theme.palette.surface.subtle,
  color: theme.palette.text.secondary,
  ...theme.typography.caption,
  fontWeight: 600,
  letterSpacing: '0.04em',
  userSelect: 'none'
}))

/**
 * The action band at the very top of a work pane.
 *
 * Not a heading that merely repeats the pane's name — it is for operating the pane:
 * display modes, tabs, and so on. Height and padding are unified here so that no screen
 * invents its own little row of buttons.
 */
export const PaneToolbar = styled('header')(({ theme }) => ({
  height: theme.density.control.lg,
  flex: `0 0 ${theme.density.control.lg}px`,
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(1),
  minWidth: 0,
  padding: `0 ${theme.spacing(2)}`,
  borderBottom: `1px solid ${theme.palette.border.subtle}`,
  background: theme.palette.surface.default,
  color: theme.palette.text.secondary,
  userSelect: 'none',
  overflow: 'hidden'
}))

export const WorkbenchPaneBody = styled('div', {
  shouldForwardProp: blockProps('scroll', 'pad')
})<{ scroll?: boolean; pad?: number }>(({ theme, scroll = false, pad }) => ({
  display: 'flex',
  flexDirection: 'column',
  flex: '1 1 auto',
  minWidth: 0,
  minHeight: 0,
  overflow: scroll ? 'auto' : 'hidden',
  padding: pad === undefined ? undefined : theme.spacing(pad)
}))

/** The tab strip for switching what is being worked on: code, a terminal, and so on. */
export const EditorTabBar = styled('div')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(1),
  height: theme.density.control.lg,
  flex: `0 0 ${theme.density.control.lg}px`,
  minWidth: 0,
  padding: `0 ${theme.spacing(1)}`,
  overflow: 'hidden',
  background: theme.palette.surface.default,
  borderBottom: `1px solid ${theme.palette.border.subtle}`,
  userSelect: 'none'
}))

export const EditorTabActions = styled('div')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  flex: '0 0 auto',
  gap: theme.spacing(1),
  paddingLeft: theme.spacing(1),
  borderLeft: `1px solid ${theme.palette.border.subtle}`
}))
