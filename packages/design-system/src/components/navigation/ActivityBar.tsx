import { useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react'
import { styled } from '@mui/material/styles'
import { activityBarWidth } from '../layout/Panel.js'
import { blockProps, canHover } from '../../theme/styled.js'

export interface ActivityBarItem {
  id: string
  label: string
  icon: ReactNode
  badge?: number | 'dot'
}

export interface ActivityBarProps {
  label: string
  items: ActivityBarItem[]
  /** The items currently shown as panes. Several can be named at once. */
  visibleIds: string[]
  /** The single item the keyboard and the contents on the right are pointed at. */
  activeId?: string | null
  side?: 'left' | 'right'
  onToggle(id: string): void
  onReorder?(ids: string[]): void
}

const Root = styled('nav', { shouldForwardProp: blockProps('side') })<{ side: 'left' | 'right' }>(
  ({ theme, side }) => ({
    flex: `0 0 ${activityBarWidth(theme)}px`,
    width: activityBarWidth(theme),
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: theme.spacing(1),
    padding: `${theme.spacing(2)} ${theme.spacing(1)}`,
    background: theme.palette.surface.subtle,
    boxShadow: `inset ${side === 'left' ? -1 : 1}px 0 0 ${theme.palette.border.subtle}`,
    userSelect: 'none'
  })
)

const Button = styled('button', {
  shouldForwardProp: blockProps('visible', 'active', 'dragging')
})<{ visible?: boolean; active?: boolean; dragging?: boolean }>(
  ({ theme, visible, active, dragging }) => ({
    position: 'relative',
    display: 'grid',
    placeItems: 'center',
    width: theme.density.control.lg,
    height: theme.density.control.lg,
    flex: '0 0 auto',
    padding: 0,
    border: dragging
      ? `1px solid ${theme.palette.border.strong}`
      : '1px solid transparent',
    borderRadius: theme.radius.sm,
    color: active
      ? theme.palette.primaryText
      : visible
        ? theme.palette.text.primary
        : theme.palette.text.tertiary,
    background: dragging
      ? theme.palette.surface.raised
      : visible
        ? theme.palette.surface.selected
        : 'transparent',
    boxShadow: dragging
      ? `0 1px 2px ${theme.palette.surface.overlay}, 0 8px 16px ${theme.palette.surface.overlay}`
      : undefined,
    cursor: 'pointer',
    '&[draggable="true"]': { cursor: 'grab' },
    transition: theme.transitions.create(['background-color', 'color'], { duration: theme.transitions.duration.shortest }),
    [canHover]: { '&:hover': {
      color: active ? theme.palette.primaryText : theme.palette.text.primary,
      background: visible ? theme.palette.surface.selected : theme.palette.surface.hover
    } },
    '&:focus-visible': { outline: `2px solid ${theme.palette.primaryText}`, outlineOffset: -2 },
    '&:active': { cursor: 'grabbing' },
    '&::before': active
      ? {
          content: '""',
          position: 'absolute',
          left: `calc(${theme.spacing(1)} * -1)`,
          top: theme.spacing(2),
          bottom: theme.spacing(2),
          width: 2,
          borderRadius: theme.radius.full,
          background: theme.palette.primaryText
        }
      : undefined
  })
)

const Badge = styled('span', { shouldForwardProp: blockProps('dot') })<{ dot?: boolean }>(
  ({ theme, dot }) => ({
  position: 'absolute',
  top: theme.spacing(1),
  right: theme.spacing(1),
  minWidth: dot ? theme.markSize : theme.iconSize.sm,
  width: dot ? theme.markSize : undefined,
  height: dot ? theme.markSize : theme.iconSize.sm,
  padding: dot ? 0 : `0 ${theme.spacing(1)}`,
  borderRadius: theme.radius.full,
  display: 'grid',
  placeItems: 'center',
  background: theme.palette.primary.main,
  color: theme.palette.primary.contrastText,
  ...theme.typography.caption,
  fontWeight: 600,
  fontVariantNumeric: 'tabular-nums',
  pointerEvents: 'none',
  boxShadow: `0 0 0 1px ${theme.palette.surface.subtle}`
}))

const DropGap = styled('span')(({ theme }) => ({
  width: theme.density.control.lg,
  height: theme.spacing(2),
  flex: '0 0 auto',
  borderRadius: theme.radius.full,
  background: theme.palette.primaryText,
  transition: theme.transitions.create('height', { duration: theme.transitions.duration.shortest })
}))

const ItemSlot = styled('span')({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  flex: '0 0 auto'
})

function move(items: ActivityBarItem[], id: string, target: number): ActivityBarItem[] {
  const from = items.findIndex((item) => item.id === id)
  if (from < 0) return items
  const next = [...items]
  const [item] = next.splice(from, 1)
  next.splice(Math.max(0, Math.min(target, next.length)), 0, item)
  return next
}

/** A drag's target is not an item index but the insertion point between two items. */
function moveToGap(items: ActivityBarItem[], id: string, gap: number): ActivityBarItem[] {
  const from = items.findIndex((item) => item.id === id)
  if (from < 0) return items
  return move(items, id, from < gap ? gap - 1 : gap)
}

/**
 * The glyph-only vertical navigation placed at the edge of an IDE.
 *
 * `visibleIds` takes several, so this is not tab switching. How the result of a press is
 * stacked is the app's decision, and this part draws "visible" and "where the hand is
 * pointed right now" separately.
 */
export function ActivityBar({
  label,
  items,
  visibleIds,
  activeId,
  side = 'left',
  onToggle,
  onReorder
}: ActivityBarProps): JSX.Element {
  const [dragged, setDragged] = useState<string | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  const finish = (): void => {
    if (dragged && dropIndex !== null && onReorder) {
      onReorder(moveToGap(items, dragged, dropIndex).map((item) => item.id))
    }
    setDragged(null)
    setDropIndex(null)
  }

  const over = (event: DragEvent, index: number): void => {
    if (!dragged) return
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    setDropIndex(index + (event.clientY > rect.top + rect.height / 2 ? 1 : 0))
  }

  const key = (event: KeyboardEvent<HTMLButtonElement>, id: string): void => {
    if (!onReorder || !event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) {
      return
    }
    event.preventDefault()
    const index = items.findIndex((item) => item.id === id)
    const target = index + (event.key === 'ArrowUp' ? -1 : 1)
    if (target < 0 || target >= items.length) return
    onReorder(move(items, id, target).map((item) => item.id))
    requestAnimationFrame(() => {
      document
        .querySelectorAll<HTMLElement>('[data-activity-id]')
        .forEach((element) => {
          if (element.dataset.activityId === id) element.focus()
        })
    })
  }

  return (
    <Root aria-label={label} side={side} onDragEnd={finish}>
      {items.map((item, index) => (
        <ItemSlot key={item.id}>
          {dropIndex === index && dragged !== item.id && <DropGap />}
          <Button
            type="button"
            title={item.label}
            aria-label={item.label}
            aria-pressed={visibleIds.includes(item.id)}
            data-activity-id={item.id}
            visible={visibleIds.includes(item.id)}
            active={activeId === item.id}
            dragging={dragged === item.id}
            draggable={Boolean(onReorder)}
            onClick={() => onToggle(item.id)}
            onKeyDown={(event) => key(event, item.id)}
            onDragStart={(event) => {
              setDragged(item.id)
              setDropIndex(index)
              event.dataTransfer.effectAllowed = 'move'
              event.dataTransfer.setData('text/plain', item.id)
            }}
            onDragOver={(event) => over(event, index)}
            onDrop={(event) => {
              event.preventDefault()
              finish()
            }}
          >
            {item.icon}
            {item.badge !== undefined && item.badge !== 0 && (
              <Badge dot={item.badge === 'dot'}>{item.badge === 'dot' ? null : item.badge}</Badge>
            )}
          </Button>
        </ItemSlot>
      ))}
      {dropIndex === items.length && dragged && <DropGap />}
    </Root>
  )
}
