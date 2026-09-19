import { styled } from '@mui/material/styles'
import { blockProps } from '../../theme/styled.js'
import { glassMaterial } from '../../theme/glass.js'
import { footerBandHeight, headerBandHeight } from './Panel.js'

/**
 * The skeleton of the whole window. The left/right composition lives in body; the main pane and its bottom edge are grouped in main.
 *
 * Height distribution is fully decided here, so inner panes only need to honor `min-height: 0` themselves.
 */
export const AppShell = styled('div', { shouldForwardProp: blockProps('glass') })<{
  /** Join transparent pane headers and side panels on one continuous material. */
  glass?: boolean
}>(({ theme, glass }) => ({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  overflow: 'hidden',
  ...(glass ? {
    ...glassMaterial(theme),
    // Side panels retain their edges and ink, but inherit this sheet instead of stacking a second film.
    '--ds-glass-panel-background': 'transparent',
    '--ds-glass-panel-image': 'none',
    '--ds-glass-panel-filter': 'none'
  } : {})
}))

/**
 * The top band. In a desktop app it doubles as the window drag region.
 * Controls placed on a surface marked `draggable` must be wrapped in `AppShellNoDrag`.
 */
export const AppShellHeader = styled('header', { shouldForwardProp: blockProps('draggable', 'inset') })<{
  /** Make this the window drag region */
  draggable?: boolean
  /** Space to leave at the left edge (px). Where the OS window controls live */
  inset?: number
}>(({ theme, draggable, inset }) => ({
  height: headerBandHeight(theme),
  flex: `0 0 ${headerBandHeight(theme)}px`,
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(3),
  padding: `0 ${theme.spacing(3)}`,
  paddingLeft: inset ?? theme.spacing(3),
  background: theme.palette.surface.subtle,
  borderBottom: `1px solid ${theme.palette.border.subtle}`,
  // The window band. It's the place you grab to move the window, so text must not get selected when you grab it
  userSelect: 'none',
  ...(draggable ? { WebkitAppRegion: 'drag' } : {})
}))

/** Things that stay clickable inside the drag region. */
export const AppShellNoDrag = styled('div')({
  WebkitAppRegion: 'no-drag',
  display: 'flex',
  alignItems: 'center',
  gap: 8
})

/**
 * Turns empty space in a band into a surface that grabs and moves the window.
 *
 * In an app without a window band, what lines up at the top is pane headers, not a band.
 * **Do not make the whole header grabbable** — a grabbable surface swallows every mouse
 * event, so even right-clicks on the header (the menu for that pane) disappear.
 * Only **space that never had anything on it** may be grabbable.
 *
 * Do not put clickable things inside. The moment you want to, it is no longer empty space.
 */
export const WindowDragArea = styled('div')({
  flex: '1 1 auto',
  minWidth: 0,
  // The gap has no content, so it stretches to the full band height on its own (the grabbable area gets the band's height)
  alignSelf: 'stretch',
  WebkitAppRegion: 'drag'
})

/**
 * The torso where panes line up side by side.
 *
 * **No rule along the top edge.** There is not always a band above (in an app without
 * a window band this is the very top of the window). The boundary with a band is drawn
 * by the band's side
 */
export const AppShellBody = styled('div')({
  flex: 1,
  display: 'flex',
  minHeight: 0,
  position: 'relative'
})

/** The main pane alongside the left auxiliary panels. The footer also stays inside this pane's width and height. */
export const AppShellMain = styled('main', { shouldForwardProp: blockProps('windowHeader') })<{
  /** Leave the top band open to the shell's material, including when navigation is collapsed. */
  windowHeader?: boolean
}>(({ theme, windowHeader }) => ({
  display: 'flex',
  flexDirection: 'column',
  flex: '1 1 0',
  minWidth: 0,
  minHeight: 0,
  overflow: 'hidden',
  background: windowHeader
    ? `linear-gradient(to bottom, transparent ${headerBandHeight(theme)}px, ${theme.palette.surface.canvas} ${headerBandHeight(theme)}px)`
    : theme.palette.surface.canvas,
  // Moving surfaces paint their own ground. A stationary canvas beneath the glass
  // would leave its old boundary visible while a collection joins that material.
  '[data-motion-active] &': { background: 'transparent', overflow: 'visible' }
}))

/**
 * The bottom band.
 * A surface for noticing change, not for reading, so its height is fixed and it never moves.
 */
export const AppShellFooter = styled('footer', { shouldForwardProp: blockProps('accent') })<{
  /** Draw a colored line along the top edge to signal an out-of-the-ordinary state */
  accent?: string
}>(({ theme, accent }) => ({
  height: footerBandHeight(theme),
  flex: `0 0 ${footerBandHeight(theme)}px`,
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(4),
  padding: `0 ${theme.spacing(3)}`,
  boxShadow: `inset 0 1px 0 ${theme.palette.border.subtle}`,
  background: theme.palette.surface.subtle,
  fontSize: theme.typography.caption.fontSize,
  color: theme.palette.text.secondary,
  // An instrument, not a reading surface. Dragging over the numbers to select them means nothing
  userSelect: 'none',
  ...(accent ? { boxShadow: `inset 0 2px 0 ${accent}` } : {})
}))
