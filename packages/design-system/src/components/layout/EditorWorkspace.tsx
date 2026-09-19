import { alpha, styled } from '@mui/material/styles'

/** An editor's explorer surface, its body, and the input field laid over it. It carries no meaning about the app's targets or actions. */
export const WorkSurface = styled('div')({
  display: 'flex',
  flexDirection: 'column',
  flex: '1 1 auto',
  minWidth: 0,
  minHeight: 0
})

export const ExplorerLayout = styled('div')(({ theme }) => ({
  display: 'flex',
  flex: '1 1 auto',
  minWidth: 0,
  minHeight: 0,
  background: theme.palette.surface.default
}))

export const ExplorerPane = styled('section')(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  flex: `0 0 ${theme.spacing(64)}`,
  width: theme.spacing(64),
  minHeight: 0,
  borderRight: `1px solid ${theme.palette.border.subtle}`,
  background: theme.palette.surface.default
}))

export const EditorPane = styled('section')(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  flex: '1 1 auto',
  minWidth: 0,
  minHeight: 0,
  background: theme.palette.surface.canvas
}))

export const TerminalSurface = styled('div')(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  flex: '1 1 auto',
  minWidth: 0,
  minHeight: 0,
  background: theme.palette.surface.default,
  color: theme.palette.text.primary,
  fontFamily: theme.typography.fontFamilyMono
}))

export const OverlayViewport = styled('div')({
  display: 'flex',
  flexDirection: 'column',
  flex: '1 1 auto',
  minWidth: 0,
  minHeight: 0,
  position: 'relative'
})

export const FindBar = styled('form')(({ theme }) => ({
  position: 'absolute',
  zIndex: 2,
  top: theme.spacing(2),
  right: theme.spacing(3),
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(1),
  padding: theme.spacing(1),
  border: `1px solid ${theme.palette.border.strong}`,
  borderRadius: theme.radius.sm,
  background: theme.palette.surface.raised,
  boxShadow: theme.palette.elevation.raised
}))

export const FloatingEditorForm = styled('form')(({ theme }) => ({
  position: 'absolute',
  right: theme.spacing(3),
  bottom: theme.spacing(3),
  zIndex: 4,
  width: theme.spacing(80),
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing(2),
  padding: theme.spacing(3),
  border: `1px solid ${theme.palette.border.strong}`,
  borderRadius: theme.radius.lg,
  background: theme.palette.surface.raised,
  boxShadow: `0 1px 2px ${alpha(theme.palette.common.black, 0.24)}, 0 12px 24px ${alpha(theme.palette.common.black, 0.32)}`
}))

/** The rectangle laid over an external drawing area. How it is actually drawn belongs to the caller. */
export const EmbeddedContentHost = styled('div')(({ theme }) => ({
  flex: '1 1 auto',
  minWidth: 0,
  minHeight: 0,
  background: theme.palette.surface.canvas
}))
