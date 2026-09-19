import { Fragment, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { alpha, styled } from '@mui/material/styles'
import { blockProps, canHover } from '../../theme/styled.js'

export interface TreeNode {
  id: string
  label: string
  title?: string
  description?: string
  /** A subdued row tint; the caller owns the meaning of each tone. */
  tone?: 'success' | 'warning' | 'danger'
  icon?: ReactNode
  meta?: ReactNode
  children?: TreeNode[]
}

export interface TreeViewProps {
  nodes: TreeNode[]
  selectedId?: string | null
  expandIcon: ReactNode
  collapseIcon: ReactNode
  label: string
  /** The branches opened on first render. Decided by the caller, who knows how big the data set is. */
  defaultExpandedIds?: string[]
  /** Reports the pressed item, for both files and directories. */
  onActivate?(node: TreeNode): void
  onSelect?(id: string): void
  /** The caller owns the item's context menu; opening it does not activate or expand the row. */
  onContextMenu?(event: MouseEvent<HTMLElement>, node: TreeNode): void
}

const Root = styled('div')({
  flex: '1 1 auto',
  minHeight: 0,
  overflow: 'auto',
  outline: 0
})

const Row = styled('button', { shouldForwardProp: blockProps('depth', 'selected', 'tone') })<{
  depth: number
  selected?: boolean
  tone?: TreeNode['tone']
}>(({ theme, depth, selected, tone }) => {
  const tint = tone ? theme.palette[tone === 'danger' ? 'error' : tone].main : undefined
  return {
    width: '100%',
    height: theme.density.row.sm,
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    padding: `0 ${theme.spacing(2)} 0 ${theme.spacing(2 + depth * 3)}`,
    border: 0,
    background: tint ? alpha(tint, selected ? 0.2 : 0.1) : selected ? theme.palette.surface.selected : 'transparent',
    boxShadow: selected ? `inset 2px 0 ${theme.palette.primaryText}` : undefined,
    color: selected ? theme.palette.text.primary : theme.palette.text.secondary,
    textAlign: 'left',
    ...theme.typography.caption,
    cursor: 'default',
    [canHover]: {
      '&:hover': {
        background: tint ? alpha(tint, selected ? 0.24 : 0.16) : selected ? theme.palette.surface.selected : theme.palette.surface.hover,
        color: theme.palette.text.primary
      }
    },
    '&:active': { background: tint ? alpha(tint, 0.24) : theme.palette.surface.selected },
    '&:focus-visible': { outline: `2px solid ${theme.palette.primaryText}`, outlineOffset: -2 }
  }
})

const Disclosure = styled('span')({
  width: 14,
  flex: '0 0 14px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center'
})

const Label = styled('span')({
  minWidth: 0,
  flex: '1 1 auto',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
})

function rootDirectories(nodes: TreeNode[]): Set<string> {
  const first = nodes.find((node) => node.children)
  return new Set(first ? [first.id] : [])
}

/** The one-item-per-row tree shared by file, settings and category trees. */
export function TreeView({
  nodes,
  selectedId,
  expandIcon,
  collapseIcon,
  label,
  defaultExpandedIds,
  onActivate,
  onSelect,
  onContextMenu
}: TreeViewProps): JSX.Element {
  // Expanding a large repository in full puts thousands of rows into the DOM on the
  // first paint alone. Open only the first root, and begin the way an IDE does: walk
  // down to the branches you need.
  const defaults = defaultExpandedIds ?? [...rootDirectories(nodes)]
  // Adding the defaults back every time the caller renders a new array with the same
  // IDs reopens a branch you just closed on the very next paint. Initialize as a
  // different tree only when the set of values actually changes.
  const defaultsKey = defaults.join('\0')
  const [open, setOpen] = useState(() => new Set(defaults))
  const appliedDefaults = useRef(defaultsKey)

  useEffect(() => {
    if (appliedDefaults.current === defaultsKey) return
    appliedDefaults.current = defaultsKey
    setOpen(new Set(defaultsKey ? defaultsKey.split('\0') : []))
  }, [defaultsKey])

  const render = (items: TreeNode[], depth: number): ReactNode =>
    items.map((node) => {
      const expanded = node.children ? open.has(node.id) : false
      return (
        <Fragment key={node.id}>
          <Row
            type="button"
            role="treeitem"
            depth={depth}
            selected={selectedId === node.id}
            tone={node.tone}
            aria-description={node.description}
            aria-selected={selectedId === node.id}
            aria-expanded={node.children ? expanded : undefined}
            title={node.title ?? node.label}
            onContextMenu={(event) => onContextMenu?.(event, node)}
            onClick={() => {
              onActivate?.(node)
              if (node.children) {
                setOpen((current) => {
                  const next = new Set(current)
                  if (next.has(node.id)) next.delete(node.id)
                  else next.add(node.id)
                  return next
                })
              } else {
                onSelect?.(node.id)
              }
            }}
          >
            <Disclosure>{node.children ? (expanded ? collapseIcon : expandIcon) : null}</Disclosure>
            {node.icon}
            <Label>{node.label}</Label>
            {node.meta}
          </Row>
          {node.children && expanded ? render(node.children, depth + 1) : null}
        </Fragment>
      )
    })

  return (
    <Root role="tree" aria-label={label} tabIndex={0}>
      {render(nodes, 0)}
    </Root>
  )
}
