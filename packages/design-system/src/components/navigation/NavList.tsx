import type { MouseEvent, ReactNode } from 'react'
import { styled } from '@mui/material/styles'
import { blockProps, canHover, surfaceStyles, type SurfaceLevel } from '../../theme/styled.js'
import { footerBandHeight, headerBandHeight } from '../layout/Panel.js'

export { default as Tabs } from '@mui/material/Tabs'
export { default as Tab } from '@mui/material/Tab'

/**
 * The vertical navigation.
 *
 * Only "things looked at daily" go here; definitions and configuration are dropped
 * elsewhere. Collapsed is not a shrunken copy of expanded — items that cannot be told
 * apart are not kept.
 */
export const SideNav = styled('nav', {
  shouldForwardProp: blockProps('collapsed', 'width', 'collapsedWidth', 'surface', 'bordered')
})<{
  collapsed?: boolean
  width?: number
  collapsedWidth?: number
  /** The surface level. Pick a translucent surface and whatever is behind appears to move */
  surface?: SurfaceLevel
  /** When it sits inside a single container, leave the section boundary to that container */
  bordered?: boolean
}>(({ theme, collapsed, width = 208, collapsedWidth = 52, surface = 'subtle', bordered = true }) => ({
  flex: '0 0 auto',
  width: collapsed ? collapsedWidth : width,
  // Keep the collapsed glyph column's centre even when expanded. Do not stack the parent's padding onto the row's.
  '--nav-icon-column': `${collapsedWidth}px`,
  ...surfaceStyles(theme, surface),
  ...(bordered ? { borderRight: `1px solid ${theme.palette.border.subtle}` } : {}),
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  overflow: 'hidden'
}))

/**
 * The band that holds nothing but the collapse/expand control.
 * Its height matches a panel header, so the bands crossing the window line up as one.
 *
 * **Centre it when collapsed.** The items below centre themselves when collapsed, so
 * leaving this band left-aligned puts it a few px off from everything else in the
 * vertical run of glyphs. Things stacked in one column share one axis.
 */
export const SideNavTop = styled('div', {
  shouldForwardProp: blockProps('collapsed', 'draggable', 'inset')
})<{
  collapsed?: boolean
  /** Make it a surface you can grab to move the window (in an app with no title bar, this band stands in for one) */
  draggable?: boolean
  /** Padding left free at the left edge (px). Where the OS window buttons live */
  inset?: number
}>(({ theme, collapsed, draggable, inset }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: collapsed ? 'center' : 'flex-start',
  height: headerBandHeight(theme),
  padding: collapsed ? 0 : `0 ${theme.spacing(2)}`,
  ...(inset !== undefined ? { paddingLeft: inset } : {}),
  flex: '0 0 auto',
  ...(draggable ? { WebkitAppRegion: 'drag' } : {})
}))

export const NavSection = styled('div', { shouldForwardProp: blockProps('grow', 'pinned') })<{
  grow?: boolean
  /** A section pinned to the bottom. Configuration and settings go here */
  pinned?: boolean
}>(({ theme, grow, pinned }) => ({
  padding: `0 ${theme.spacing(2)}`,
  flex: '0 0 auto',
  ...(grow ? { flex: '1 1 auto', minHeight: 0, overflowY: 'auto', marginTop: theme.spacing(2) } : {}),
  ...(pinned
    ? {
        marginTop: theme.spacing(2),
        height: footerBandHeight(theme),
        display: 'flex',
        alignItems: 'center',
        // Shares height and centre with the main panel's footer, and the rule must not push it down half a pixel.
        boxShadow: `inset 0 1px 0 ${theme.palette.border.subtle}`
      }
    : {})
}))

export const NavHeading = styled('h2')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: theme.spacing(2),
  height: 22,
  padding: `0 ${theme.spacing(2)}`,
  paddingLeft: `calc((var(--nav-icon-column, 52px) - ${theme.iconSize.lg}px) / 2 - ${theme.spacing(2)})`,
  margin: '0 0 2px',
  ...theme.typography.caption,
  fontWeight: 600,
  // Space the short word out. The shape says this is a section name, not an item
  letterSpacing: '0.04em',
  color: theme.palette.text.tertiary
}))

const ItemRoot = styled('button', { shouldForwardProp: blockProps('active', 'collapsed') })<{
  active?: boolean
  collapsed?: boolean
}>(({ theme, active, collapsed }) => ({
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(2),
  width: '100%',
  height: collapsed ? 30 : theme.density.control.md,
  padding: collapsed ? 0 : `0 ${theme.spacing(2)}`,
  paddingLeft: collapsed ? 0 : `calc((var(--nav-icon-column, 52px) - ${theme.iconSize.lg}px) / 2 - ${theme.spacing(2)})`,
  justifyContent: collapsed ? 'center' : undefined,
  border: 0,
  borderRadius: theme.radius.sm,
  background: active ? theme.palette.surface.selected : 'transparent',
  textAlign: 'left',
  ...theme.typography.body2,
  fontWeight: active ? 500 : 400,
  color: active ? theme.palette.text.primary : theme.palette.text.secondary,
  cursor: 'pointer',
  transition: theme.transitions.create(['background-color', 'color'], { duration: theme.transitions.duration.shortest }),
  [canHover]: { '&:hover': { background: active ? theme.palette.surface.selected : theme.palette.surface.hover, color: theme.palette.text.primary } },
  '&:active': { background: theme.palette.surface.selected },
  '&:focus-visible': { outline: `2px solid ${theme.palette.primaryText}`, outlineOffset: -2 },
  /*
   * Glyphs read heavier than text, so they always sit one step back in color.
   * Only the selected row is lifted to the primary color, which together with the
   * background says "you are here" twice
   */
  '& [data-icon]': {
    color: active ? theme.palette.primaryText : theme.palette.text.tertiary
  },
  '&:hover [data-icon]': { color: active ? theme.palette.primaryText : theme.palette.text.secondary }
}))

const ItemIcon = styled('span')(({ theme }) => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: theme.iconSize.lg,
  flex: `0 0 ${theme.iconSize.lg}px`
}))

const ItemLabel = styled('span')({
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
})

const ItemBadge = styled('span', { shouldForwardProp: blockProps('accent') })<{ accent?: string }>(
  ({ theme, accent }) => ({
    ...theme.typography.caption,
    fontVariantNumeric: 'tabular-nums',
    color: accent ?? theme.palette.text.tertiary,
    fontWeight: accent ? 600 : 400
  })
)

/** Collapsed there is no room for the count, so only its presence is kept, as a dot. */
const ItemMark = styled('span', { shouldForwardProp: blockProps('accent') })<{ accent?: string }>(
  ({ theme, accent }) => ({
    position: 'absolute',
    top: theme.spacing(2),
    right: 0,
    width: 6,
    height: 6,
    borderRadius: theme.radius.full,
    background: accent ?? theme.palette.text.tertiary
  })
)

export interface NavItemProps {
  icon: ReactNode
  label: string
  active?: boolean
  collapsed?: boolean
  /** The count. 0 and undefined are not drawn */
  badge?: number
  /** The color for a count that should draw attention */
  accent?: string
  title?: string
  onClick?(): void
  onContextMenu?(event: MouseEvent<HTMLButtonElement>): void
}

/** One row of navigation. Collapsed it is the glyph only, plus a tooltip. */
export function NavItem({
  icon,
  label,
  active,
  collapsed,
  badge,
  accent,
  title,
  onClick,
  onContextMenu
}: NavItemProps): JSX.Element {
  const hasBadge = badge !== undefined && badge > 0
  return (
    <ItemRoot
      type="button"
      active={active}
      collapsed={collapsed}
      /* The current row can be addressed from outside too (the landing spot when entering the panel by keyboard) */
      data-active={active || undefined}
      aria-current={active ? 'page' : undefined}
      title={title ?? label}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <ItemIcon data-icon>{icon}</ItemIcon>
      {!collapsed && <ItemLabel>{label}</ItemLabel>}
      {!collapsed && hasBadge && <ItemBadge accent={accent}>{badge}</ItemBadge>}
      {collapsed && hasBadge && <ItemMark accent={accent} />}
    </ItemRoot>
  )
}

/* --------------------------------------------------------- vertical menu */

/** The list of categories. It does not shrink when contents open (it is already at its smallest). */
export const MenuNav = styled('nav')(({ theme }) => ({
  flex: '0 0 200px',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  padding: `${theme.spacing(3)} ${theme.spacing(2)}`,
  borderRight: `1px solid ${theme.palette.border.subtle}`,
  background: theme.palette.surface.default,
  overflowY: 'auto'
}))

/**
 * The column's heading. It shares the window's top band with the OS window controls,
 * so it takes the same `startInset` as `PanelHeader` (this column is the leading
 * surface when the navigation beside it is collapsed).
 */
export const MenuNavTitle = styled('h1', { shouldForwardProp: blockProps('startInset') })<{
  /** Width (px) reserved outside the normal padding when the OS window controls overhang this column. */
  startInset?: number
}>(({ theme, startInset }) => ({
  margin: `0 0 ${theme.spacing(2)}`,
  padding: `0 ${theme.spacing(2)}`,
  ...(startInset !== undefined ? { paddingLeft: `calc(${startInset}px + ${theme.spacing(2)})` } : {}),
  ...theme.typography.caption,
  fontWeight: 600,
  color: theme.palette.text.tertiary
}))

const MenuNavItemRoot = styled('button', { shouldForwardProp: blockProps('active') })<{
  active?: boolean
}>(({ theme, active }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(2),
  width: '100%',
  padding: `6px ${theme.spacing(2)}`,
  border: 0,
  borderRadius: theme.radius.sm,
  background: active ? theme.palette.surface.selected : 'transparent',
  textAlign: 'left',
  cursor: 'pointer',
  color: active ? theme.palette.text.primary : theme.palette.text.secondary,
  [canHover]: { '&:hover': { background: active ? theme.palette.surface.selected : theme.palette.surface.hover } },
  '&:active': { background: theme.palette.surface.selected },
  '&:focus-visible': { outline: `2px solid ${theme.palette.primaryText}`, outlineOffset: -2 },
  '& [data-icon]': {
    display: 'inline-flex',
    color: active ? theme.palette.primaryText : theme.palette.text.tertiary
  }
}))

const MenuNavBody = styled('span')({ display: 'flex', flexDirection: 'column', minWidth: 0 })

const MenuNavLabel = styled('span')(({ theme }) => ({ ...theme.typography.body2 }))
const MenuNavHint = styled('span')(({ theme }) => ({
  ...theme.typography.caption,
  color: theme.palette.text.tertiary,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis'
}))

export interface MenuNavItemProps {
  icon: ReactNode
  label: string
  /** Says in one line when you would open it. So the grain of the categories can be read */
  hint?: string
  active?: boolean
  onClick(): void
}

export function MenuNavItem({ icon, label, hint, active, onClick }: MenuNavItemProps): JSX.Element {
  return (
    <MenuNavItemRoot
      type="button"
      active={active}
      data-active={active || undefined}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
    >
      <span data-icon>{icon}</span>
      <MenuNavBody>
        <MenuNavLabel>{label}</MenuNavLabel>
        {hint && <MenuNavHint>{hint}</MenuNavHint>}
      </MenuNavBody>
    </MenuNavItemRoot>
  )
}
