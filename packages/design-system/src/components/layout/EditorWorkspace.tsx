import { alpha, styled } from '@mui/material/styles'
import { useLayoutEffect, useRef, useState, type ComponentPropsWithoutRef } from 'react'
import { explorerContentMinWidth, fitPaneWidth, paneProfiles, type PaneWidth } from '../../layoutSpec.js'
import { blockProps } from '../../theme/styled.js'
import { Resizer } from './Resizer.js'

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

const ExplorerPaneRoot = styled('section', { shouldForwardProp: blockProps('width') })<{ width: PaneWidth }>(({ theme, width }) => ({
  display: 'flex',
  flexDirection: 'column',
  flex: `0 0 ${width}px`,
  width,
  minWidth: 0,
  minHeight: 0,
  overflow: 'hidden',
  background: theme.palette.surface.default
}))

export interface ExplorerPaneProps extends ComponentPropsWithoutRef<'section'> {
  width?: PaneWidth
  onWidthChange?(width: PaneWidth): void
}

/** The explorer and its boundary are one control, so no browsing surface can omit resizing. */
export function ExplorerPane({ width, onWidthChange, children, ...props }: ExplorerPaneProps): JSX.Element {
  const [localWidth, setLocalWidth] = useState(paneProfiles.explorer.initial)
  const [availableWidth, setAvailableWidth] = useState<number>()
  const root = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const parent = root.current?.parentElement
    if (!parent) return
    const measure = (): void => {
      const total = parent.getBoundingClientRect().width
      if (total > 0) setAvailableWidth(Math.max(0, total - 1 - Math.min(explorerContentMinWidth, total / 2)))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(parent)
    return () => observer.disconnect()
  }, [])
  const value = fitPaneWidth('explorer', width ?? localWidth, availableWidth)
  const change = (next: PaneWidth): void => { setLocalWidth(next); onWidthChange?.(next) }
  return <>
    <ExplorerPaneRoot {...props} ref={root} width={value}>{children}</ExplorerPaneRoot>
    <Resizer profile="explorer" value={value} availableWidth={availableWidth}
      label={props['aria-label']} onChange={change} />
  </>
}

export const EditorPane = styled('section')(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  flex: '1 1 auto',
  minWidth: 0,
  minHeight: 0,
  background: theme.palette.surface.canvas
}))

/** A scrolling document with a bounded reading measure, independent of its navigation. */
export const DocumentBody = styled('div')(({ theme }) => ({
  flex: '1 1 auto', minHeight: 0, overflow: 'auto', padding: theme.spacing(6),
  '& > *': { maxWidth: theme.measure, marginInline: 'auto' }
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
