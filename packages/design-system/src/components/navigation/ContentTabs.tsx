import { forwardRef, useLayoutEffect, useRef, type ComponentPropsWithoutRef, type MouseEvent, type ReactNode } from 'react'
import MuiTabs from '@mui/material/Tabs'
import MuiTab from '@mui/material/Tab'
import MuiTabScrollButton, { type TabScrollButtonProps } from '@mui/material/TabScrollButton'
import { styled } from '@mui/material/styles'
import { X } from 'lucide-react'
import { blockProps, canHover } from '../../theme/styled.js'
import { useStrings } from '../../theme/strings.js'

export interface ContentTabOption<T extends string> {
  value: T
  label: string
  icon?: ReactNode
  count?: number
  title?: string
  disabled?: boolean
  muted?: boolean
}

export interface ContentTabsProps<T extends string> {
  /** An identifier (from useId or similar) that will not collide with another tab strip on the same page. */
  idBase: string
  label: string
  value: T | null
  options: ReadonlyArray<ContentTabOption<T>>
  appearance?: 'underline' | 'document'
  onChange(value: T): void
  /** Close a tab. The selection and discarding the contents are owned by the caller. */
  onClose?(value: T): void
  /** Context actions belong to the pointed tab, including when another tab is selected. */
  onContextMenu?(event: MouseEvent<HTMLElement>, value: T): void
}

const Root = styled(MuiTabs, { shouldForwardProp: blockProps('appearance') })<{
  appearance: 'underline' | 'document'
}>(({ theme, appearance }) => ({
  flex: '1 1 auto',
  minWidth: 0,
  height: theme.density.control.lg,
  minHeight: theme.density.control.lg,
  maxHeight: theme.density.control.lg,
  borderBottom: 0,
  '& .MuiTabs-list': { gap: theme.spacing(0.5) },
  '& .MuiTabs-indicator': {
    height: 2,
    borderRadius: theme.radius.full,
    transition: theme.transitions.create(['left', 'width'], { duration: theme.transitions.duration.shortest })
  },
  '& .MuiTabs-scrollButtons': {
    width: theme.iconButton.sm,
    color: theme.palette.text.secondary,
    '&.Mui-disabled': { opacity: 0.25 }
  },
  '& .MuiTab-root': {
    flexDirection: 'row',
    gap: theme.spacing(1.5),
    height: theme.density.control.lg,
    padding: `0 ${theme.spacing(2.5)}`,
    flex: '0 0 auto',
    maxWidth: theme.spacing(64),
    borderRadius: `${theme.radius.sm}px ${theme.radius.sm}px 0 0`,
    background: 'transparent',
    transition: theme.transitions.create(['background-color', 'color']),
    [canHover]: { '&:hover': { background: theme.palette.surface.hover, color: theme.palette.text.primary } },
    '&.Mui-selected': {
      background: appearance === 'document' ? theme.palette.surface.canvas : theme.palette.surface.selected,
      color: theme.palette.text.primary
    },
    '&.Mui-focusVisible': { outline: `2px solid ${theme.palette.primaryText}`, outlineOffset: -3 },
    '&[data-muted="true"]:not(.Mui-selected)': { color: theme.palette.text.tertiary }
  }
}))

const Label = styled('span')(({ theme }) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: theme.spacing(1.5),
  minWidth: 0,
  maxWidth: '100%',
  '& > svg': { flex: '0 0 auto', width: theme.iconSize.sm, height: theme.iconSize.sm },
  '& > [data-label]': { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  '& > [data-count]': {
    flex: '0 0 auto',
    ...theme.typography.caption,
    color: theme.palette.text.tertiary,
    fontVariantNumeric: 'tabular-nums'
  }
}))

const CloseButton = styled('button')(({ theme }) => ({
  display: 'inline-grid', placeItems: 'center', flex: '0 0 auto',
  width: theme.iconButton.xs, height: theme.iconButton.xs, padding: 0,
  marginRight: `-${theme.spacing(1)}`,
  border: 0, borderRadius: theme.radius.sm, background: 'transparent',
  color: theme.palette.text.tertiary, cursor: 'pointer',
  '& svg': { width: theme.iconSize.sm, height: theme.iconSize.sm },
  [canHover]: { '&:hover': { background: theme.palette.surface.selected, color: theme.palette.text.primary } },
  '&:focus-visible': { outline: `2px solid ${theme.palette.primaryText}`, outlineOffset: -2 }
}))

const SelectButton = styled('button')({
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  flex: '1 1 auto', minWidth: 0, height: '100%', padding: 0, border: 0,
  background: 'transparent', color: 'inherit', font: 'inherit', cursor: 'inherit', outline: 0
})

// Children of role=tab read as one unit to a screen reader, so the close control is a
// sibling of the select button. MUI's ref and key handling go to the select button, and
// the outer element's dimensions are the datum for the underline and for scrolling.
const ClosableTabRoot = forwardRef<HTMLButtonElement, ComponentPropsWithoutRef<'button'> & { closeControl?: ReactNode }>(
  function ClosableTabRoot({ className, style, children, closeControl, ...props }, ref) {
    return <div className={className} style={style} role="presentation">
      <SelectButton {...props} ref={ref}>{children}</SelectButton>{closeControl}
    </div>
  }
)

// The tab strip takes the arrow keys. The scroll controls carry names that say what they do to a screen reader too.
const ScrollButton = forwardRef<HTMLButtonElement, TabScrollButtonProps>((props, ref) => {
  const strings = useStrings()
  return (
    <MuiTabScrollButton {...props} ref={ref} component="button" tabIndex={-1} aria-disabled={props.disabled || undefined} aria-label={props.direction === 'left' ? strings.contentTabs.scrollLeft : strings.contentTabs.scrollRight} />
  )
})

function ids(idBase: string, value: string) {
  const key = `${idBase}-${encodeURIComponent(value)}`
  return { tab: `${key}-tab`, panel: `${key}-panel` }
}

/** Picks one thing to display. Arrows, Home/End and skipping disabled items are owned by MUI. */
export function ContentTabs<T extends string>({ idBase, label, value, options, appearance = 'underline', onChange, onClose, onContextMenu }: ContentTabsProps<T>): JSX.Element {
  const strings = useStrings()
  const root = useRef<HTMLDivElement>(null)
  const restoreFocus = useRef(false)
  useLayoutEffect(() => {
    if (!restoreFocus.current) return
    restoreFocus.current = false
    root.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus()
  }, [options, value])
  const close = (target: T): void => {
    restoreFocus.current = target === value
    onClose?.(target)
  }
  return (
    <Root
      ref={root}
      appearance={appearance}
      value={value ?? false}
      variant="scrollable"
      scrollButtons="auto"
      allowScrollButtonsMobile
      slots={{ scrollButtons: ScrollButton }}
      selectionFollowsFocus
      aria-label={label}
      onChange={(_, next: unknown) => {
        const option = options.find((item) => item.value === next)
        if (option && !option.disabled) onChange(option.value)
      }}
    >
      {options.map((option) => {
        const identity = ids(idBase, option.value)
        return (
          <MuiTab
            component={onClose ? ClosableTabRoot : 'button'}
            key={option.value}
            id={identity.tab}
            aria-controls={option.disabled ? undefined : identity.panel}
            value={option.value}
            disabled={option.disabled}
            data-muted={option.muted || undefined}
            title={option.title ?? option.label}
            onContextMenu={(event) => { if (!option.disabled) onContextMenu?.(event, option.value) }}
            aria-label={option.count === undefined ? option.label : `${option.label} ${option.count}`}
            onKeyDown={(event) => {
              if (onClose && !option.disabled && event.target === event.currentTarget && event.key === 'Delete') {
                event.preventDefault()
                event.stopPropagation()
                close(option.value)
              }
            }}
            {...(onClose ? { closeControl: !option.disabled ? <CloseButton
                type="button"
                aria-label={strings.contentTabs.close(option.label)}
                title={strings.contentTabs.closeTitle(option.label)}
                tabIndex={-1}
                // Merely closing must not briefly select an unselected tab or throw focus into the contents.
                onMouseDown={(event) => { event.preventDefault(); event.stopPropagation() }}
                onFocus={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
                onKeyUp={(event) => event.stopPropagation()}
                onClick={(event) => { event.stopPropagation(); close(option.value) }}
              ><X aria-hidden="true" /></CloseButton> : undefined } : {})}
            label={<Label>{option.icon}<span data-label>{option.label}</span>{option.count !== undefined && <span data-count>{option.count}</span>}</Label>}
          />
        )
      })}
    </Root>
  )
}

const Panel = styled('div')({
  display: 'flex',
  flexDirection: 'column',
  flex: '1 1 auto',
  minWidth: 0,
  minHeight: 0,
  overflow: 'hidden',
  '&[hidden]': { display: 'none' }
})

/** Keeps the children alive while hidden. A terminal, or content being edited, is not lost by switching tabs. */
export function ContentTabPanel({ idBase, value, activeValue, children }: {
  idBase: string
  value: string
  activeValue: string | null
  children: ReactNode
}): JSX.Element {
  const identity = ids(idBase, value)
  return <Panel role="tabpanel" id={identity.panel} aria-labelledby={identity.tab} hidden={value !== activeValue} tabIndex={0}>{children}</Panel>
}
