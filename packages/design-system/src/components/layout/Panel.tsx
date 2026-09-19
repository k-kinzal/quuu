import type { ReactNode } from 'react'
import { styled, type Theme } from '@mui/material/styles'
import { blockProps, surfaceStyles, type SurfaceLevel } from '../../theme/styled.js'
import { shellMetrics } from '../../layoutSpec.js'
import { optical } from '../../theme/tokens.js'

export type { SurfaceLevel }

/**
 * The vessel for a pane. Groups a section made of a header and a body.
 *
 * Accepts only the surface level (`surface`) and how width is decided (pass `width`, or take the remainder).
 * How the content is arranged is decided outside the vessel.
 */
export const Panel = styled('section', {
  shouldForwardProp: blockProps('surface', 'width', 'grow', 'bordered', 'scroll', 'windowHeader')
})<{
  surface?: SurfaceLevel
  /** Fixed width. Keep only one flexible-width pane */
  width?: number
  grow?: boolean
  scroll?: boolean
  /** Start the opaque ground below the window band so its header joins the shell's glass. */
  windowHeader?: boolean
  /** Draw a border on the right (the divider between panes lined up side by side) */
  bordered?: 'right' | 'left' | 'none'
}>(({ theme, surface = 'default', width, grow, bordered = 'none', scroll, windowHeader }) => ({
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  minWidth: 0,
  width,
  overflowY: scroll ? 'auto' : undefined,
  flex: grow ? '1 1 auto' : width !== undefined ? '0 0 auto' : undefined,
  ...surfaceStyles(theme, surface),
  ...(windowHeader ? {
    background: `linear-gradient(to bottom, transparent ${headerBandHeight(theme)}px, ${surfaceStyles(theme, surface).background} ${headerBandHeight(theme)}px)`
  } : {}),
  ...(bordered === 'right' ? { borderRight: `1px solid ${theme.palette.border.subtle}` } : {}),
  ...(bordered === 'left' ? { borderLeft: `1px solid ${theme.palette.border.subtle}` } : {})
}))

/** Height of the header band that crosses the window. Decided only here — never per pane */
export const HEADER_BAND = shellMetrics.headerHeight

/** For pointers the window axis wins; for touch the control hit target wins. */
export const headerBandHeight = (theme: Theme): number => Math.max(HEADER_BAND, theme.density.control.lg)

/** The fixed bottom controls and the footer also share the same band height when density changes. */
export const footerBandHeight = (theme: Theme): number => Math.max(shellMetrics.footerHeight, theme.density.control.md)

/**
 * The pane header.
 *
 * **One fixed height.** If panes lined up side by side each had headers of different
 * heights, the top of the window would turn jagged and the correspondence between
 * panes would become unreadable. Aligned, the header band reads as a single line
 * crossing the window.
 *
 * `size` changes **only the horizontal padding**. The narrower the pane, the tighter.
 */
export const PanelHeader = styled('header', {
  shouldForwardProp: blockProps('size', 'startInset', 'leadingColumn', 'trailingColumn')
})<{
  size?: 'sm' | 'md' | 'lg'
  /** Align the leading control to the ActivityBar's symbol column that continues below. */
  leadingColumn?: boolean
  /** Align the trailing control to the ActivityBar's symbol column at the right edge. */
  trailingColumn?: boolean
  /** Width (px) reserved outside the normal padding when the OS window controls overhang the pane. */
  startInset?: number
}>(({ theme, size = 'md', startInset, leadingColumn, trailingColumn }) => ({
  flex: '0 0 auto',
  display: 'flex',
  alignItems: 'center',
  minWidth: 0,
  gap: theme.spacing(size === 'sm' ? 1 : 2),
  height: headerBandHeight(theme),
  padding: `0 ${theme.spacing(size === 'sm' ? 3 : 4)}`,
  ...(leadingColumn ? { paddingLeft: 0 } : {}),
  ...(trailingColumn ? { paddingRight: 0 } : {}),
  ...(startInset !== undefined ? { paddingLeft: `calc(${startInset}px + ${theme.spacing(size === 'sm' ? 3 : 4)})` } : {}),
  // Including the rule in the height shifts the content's center to an awkward position. Draw it inside the band.
  boxShadow: `inset 0 -1px 0 ${theme.palette.border.subtle}`,
  // The header band. It holds only the title and controls, so it must not be a drag-to-select target
  userSelect: 'none'
}))

/** The symbol column's hit target and the band's leading control share the same width. */
export const activityBarWidth = (theme: Theme): number => theme.density.control.lg + Number.parseFloat(theme.spacing(2))

export const PanelHeaderLead = styled('span')(({ theme }) => ({
  width: activityBarWidth(theme),
  flex: `0 0 ${activityBarWidth(theme)}px`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center'
}))

/** Both edges use the same width, so the header never gets a center of its own. */
export const PanelHeaderTrail = PanelHeaderLead

const Heading = styled('h1')(({ theme }) => ({
  margin: 0,
  minWidth: 0,
  display: 'flex',
  alignItems: 'baseline',
  gap: theme.spacing(2),
  ...theme.typography.body1,
  fontWeight: theme.typography.fontWeightBold,
  lineHeight: 1,
  transform: `translateY(${optical.headingOffset}px)`,
  whiteSpace: 'nowrap'
}))
const HeadingLabel = styled('span')({ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' })
const HeadingCount = styled('span')(({ theme }) => ({
  ...theme.typography.caption,
  lineHeight: 1,
  fontWeight: theme.typography.fontWeightRegular,
  color: theme.palette.text.secondary,
  fontVariantNumeric: 'tabular-nums',
  flexShrink: 0
}))

/** Puts the title and its auxiliary count on the same baseline, inside the same optical correction. */
export function PanelHeading({ children, title, count }: { children: ReactNode; title?: string; count?: number }): JSX.Element {
  return <Heading><HeadingLabel title={title}>{children}</HeadingLabel>{count !== undefined && <HeadingCount>{count}</HeadingCount>}</Heading>
}

/** The pane body. Keep at most one vertically scrolling region per pane. */
export const PanelBody = styled('div', { shouldForwardProp: blockProps('scroll', 'pad') })<{
  scroll?: boolean
  /** Inner padding (a theme.spacing step) */
  pad?: number
}>(({ theme, scroll = true, pad }) => ({
  flex: 1,
  minHeight: 0,
  overflowY: scroll ? 'auto' : 'hidden',
  padding: pad !== undefined ? theme.spacing(pad) : undefined
}))

export const PanelFooter = styled('div')(({ theme }) => ({
  flex: '0 0 auto',
  borderTop: `1px solid ${theme.palette.border.subtle}`,
  padding: theme.spacing(2)
}))

/** A scroll region granted only to sections whose amount of content is unknowable. */
export const ScrollArea = styled('div')({ flex: 1, minHeight: 0, overflowY: 'auto' })

/**
 * A band that lines up controls horizontally. Placed inside a pane header, below it, or at the foot of the composer.
 *
 * **Not a text-selection surface** (rule N-3). It holds only controls and the counts
 * those controls produced, so it must not be a drag-to-select target. Treat it the
 * same as the header band (`PanelHeader`).
 *
 * Which band hugs the pane's edge is chosen by purpose. There is no API taking a multiplier — that would preserve caller-side padding tweaks.
 */
export const Toolbar = styled('div', { shouldForwardProp: blockProps('placement') })<{
  placement?: 'inline' | 'panel' | 'section'
}>(({ theme, placement = 'inline' }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(2),
  padding: placement === 'panel'
    ? `${theme.spacing(1.5)} ${theme.spacing(4)}`
    : theme.spacing(placement === 'section' ? 3 : 2),
  userSelect: 'none'
}))

/**
 * A pair of adjacent controls.
 * Places things that come as a pair, like "enlarge / shrink", slightly apart from the other controls.
 */
export const ControlGroup = styled('span')(({ theme }) => ({
  flex: '0 0 auto',
  display: 'flex',
  alignItems: 'center',
  marginLeft: theme.spacing(1)
}))
