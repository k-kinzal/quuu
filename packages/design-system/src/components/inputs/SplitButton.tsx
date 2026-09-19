import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import MuiButton, { type ButtonProps } from '@mui/material/Button'
import { styled } from '@mui/material/styles'
import { blockProps, riseIn } from '../../theme/styled.js'

/**
 * A button that pairs the primary action with its **alternative outcomes**.
 *
 * When one act can end several ways (send / keep as draft / run immediately),
 * laying out one button per outcome makes it unreadable which one is the default
 * before pressing. Here **the main button claims the default** and the rest fold
 * into the `▾`. The label and icon state the outcome outright, so no caption is needed.
 *
 * ## Why this surface draws the contents of the `▾` itself
 *
 * This kit's principle is "menus are drawn by the OS" (`surfaces/Menu.tsx`).
 * This is the one place we draw inside. **This is not a menu but a re-pick of the
 * value the pressed button carries**, and unless it appears attached to the button,
 * "which button is this about" is severed. Grab-bags of actions (right-click, `⋯`)
 * still go to the OS as before.
 *
 * The ways drawing a surface inside the window breaks are already known.
 * All of them are handled here.
 *
 * | How it breaks | How it is handled here |
 * |--------|--------------|
 * | Crushed at the window edge | Measure the height to pick above/below, pull horizontally into view |
 * | Unreachable by keyboard | `↑↓` `Home/End` `⏎` `Esc`. On open, the hand lands on the current value |
 * | A backdrop swallows the next click | No backdrop. Clicking outside still delivers that press to its real target |
 * | Lingers after switching apps | Close when the window loses focus |
 * | Doesn't follow when the surface moves | Close on scroll (never stay glued to a stale position) |
 */
export interface SplitOption<T> {
  value: T
  label: string
  /** Symbol at the head of the row. The icon set belongs to the app (not the design system) */
  icon?: ReactNode
  disabled?: boolean
}

export interface SplitButtonProps<T> extends Omit<ButtonProps, 'endIcon' | 'onSelect'> {
  /** What the `▾` opens. The button is symbol-only, so the type makes this required */
  menuTitle: string
  /** The `▾` symbol. The icon set belongs to the app */
  caret: ReactNode
  /** The selectable outcomes. List only **the results of pressing** (no settings mixed in) */
  options: SplitOption<T>[]
  /** The currently selected one. On open, the hand lands here */
  selected?: T
  onSelect(value: T): void
  /**
   * Disables the `▾` too.
   *
   * By default **the `▾` opens even when the main button can't be pressed**. Choosing
   * is not an act, so the outcome can be decided before finishing writing (decide, then write).
   */
  menuDisabled?: boolean
}

const Group = styled('div')({ display: 'inline-flex', alignItems: 'stretch' })

/** The main button. Only the right corners are dropped so it runs seamlessly into the `▾` */
const Main = styled(MuiButton)({
  borderTopRightRadius: 0,
  borderBottomRightRadius: 0
})

/**
 * The `▾`. Same color and height as the main button; only the width shrinks to the symbol.
 *
 * The divider is built from `currentColor`. On a filled button the border is the same
 * color as the fill, so relying on the border makes the divider vanish exactly when
 * the button is colored. Built from the text color, it shows at the same strength
 * in every look (filled / outlined / plain).
 */
const Caret = styled(MuiButton, { shouldForwardProp: blockProps('open') })<{ open?: boolean }>(
  ({ open }) => ({
    minWidth: 0,
    padding: '0 5px',
    marginLeft: -1,
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
    borderLeftColor: 'color-mix(in srgb, currentColor 30%, transparent)',
    '& > *': {
      transition: 'transform 120ms ease-out',
      transform: open ? 'rotate(180deg)' : 'none'
    }
  })
)

/**
 * The opened surface.
 *
 * Same rank of vessel as the command palette (floating surface + shadow). It is a
 * small surface attached to what was pressed, so only corners and padding go one step smaller.
 */
const Panel = styled('div')(({ theme }) => ({
  position: 'fixed',
  zIndex: theme.zIndex.tooltip,
  minWidth: 168,
  maxHeight: '60vh',
  overflowY: 'auto',
  padding: theme.spacing(1),
  border: `1px solid ${theme.palette.border.strong}`,
  borderRadius: theme.radius.md,
  background: theme.palette.surface.raised,
  boxShadow: theme.shadows[24],
  outline: 'none',
  animation: `${riseIn} ${theme.transitions.duration.shortest}ms ease-out`
}))

/**
 * One row.
 *
 * The strong background marks **the row the hand rests on** (the row a press would pick),
 * not the value currently in effect. The effective value is stated by the mark on the right.
 * Reversed, the strong background would not move as the hand moves, and which row `⏎`
 * applies to becomes unreadable. Pointer or keys, the hand is the same single one,
 * so the background appears on exactly one row.
 */
const Row = styled('button', { shouldForwardProp: blockProps('on') })<{ on?: boolean }>(
  ({ theme, on }) => ({
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(2),
    width: '100%',
    height: theme.density.control.sm,
    padding: `0 ${theme.spacing(2)}`,
    border: 0,
    borderRadius: theme.radius.sm,
    background: on ? theme.palette.surface.selected : 'transparent',
    color: theme.palette.text.primary,
    ...theme.typography.body2,
    whiteSpace: 'nowrap',
    textAlign: 'left',
    cursor: 'pointer',
    '& [data-icon]': { color: on ? theme.palette.primaryText : theme.palette.text.tertiary },
    /* Focus is shown by the background. Adding a ring inside the surface makes the row look doubly framed */
    '&:focus, &:focus-visible': { outline: 'none' },
    '&:disabled': { color: theme.palette.text.tertiary, cursor: 'default' }
  })
)

const RowIcon = styled('span')({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 16,
  flex: '0 0 16px'
})

const RowLabel = styled('span')({ flex: '1 1 auto' })

/**
 * The mark on the currently selected row.
 *
 * Drawn with strokes, not a borrowed glyph. This spot only says "one value is selected",
 * and the kit's rule of carrying no icon set is not bent for a single mark.
 */
const Check = styled('span')(({ theme }) => ({
  flex: '0 0 auto',
  width: 5,
  height: 9,
  marginTop: -3,
  marginLeft: theme.spacing(2),
  borderRight: `1.5px solid ${theme.palette.primaryText}`,
  borderBottom: `1.5px solid ${theme.palette.primaryText}`,
  transform: 'rotate(45deg)'
}))

/** Gap between the surface and what was pressed. Not so close they look touching, not so far the eye wanders */
const GAP = 6

interface Position {
  top: number
  right: number
}

export function SplitButton<T extends string | number>({
  menuTitle,
  caret,
  options,
  selected,
  onSelect,
  menuDisabled,
  children,
  ...rest
}: SplitButtonProps<T>): JSX.Element {
  const { color, variant, size } = rest
  const groupRef = useRef<HTMLDivElement>(null)
  const caretRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState<Position | null>(null)

  const current = Math.max(
    0,
    options.findIndex((o) => o.value === selected)
  )
  const [active, setActive] = useState(current)

  const close = useCallback((refocus: boolean): void => {
    setOpen(false)
    setAt(null)
    if (refocus) caretRef.current?.focus()
  }, [])

  /*
   * The position is decided after opening. The content height varies with the number
   * of options, so above/below is decided by **measuring what was drawn**, not by counting.
   * If it doesn't fit above, drop below; if it still doesn't fit, pull it into the screen.
   */
  useLayoutEffect(() => {
    if (!open) return
    const group = groupRef.current
    const panel = panelRef.current
    if (!group || !panel) return
    const r = group.getBoundingClientRect()
    const height = panel.offsetHeight
    const above = r.top - GAP - height
    const top = above >= 8 ? above : Math.min(r.bottom + GAP, window.innerHeight - height - 8)
    setAt({ top: Math.max(8, top), right: Math.max(8, window.innerWidth - r.right) })
  }, [open, options.length])

  /*
   * The hand lands **only after the place is decided**. Focusing before measuring
   * jumps to the surface parked at the top-left of the screen and then corrects
   * (which flickers there).
   */
  useEffect(() => {
    if (!open || !at) return
    rowRefs.current[active]?.focus()
  }, [open, at, active])

  useEffect(() => {
    if (!open) return
    /*
     * Clicking outside closes. The press is **not swallowed** (no backdrop),
     * so no extra click is needed to close and the press reaches its target as-is.
     */
    const onDown = (e: PointerEvent): void => {
      const target = e.target as Node | null
      if (panelRef.current?.contains(target ?? null)) return
      if (groupRef.current?.contains(target ?? null)) return
      close(false)
    }
    /* When the surface moves, the anchor drifts. Closing is more correct than chasing it */
    const onScroll = (): void => close(false)
    /* Don't linger across an app switch (as OS menus do) */
    const onBlur = (): void => close(false)
    document.addEventListener('pointerdown', onDown, true)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    window.addEventListener('blur', onBlur)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
      window.removeEventListener('blur', onBlur)
    }
  }, [open, close])

  /** Wrap instead of stopping at the ends (on a surface with only 4 items, hitting a wall is more confusing) */
  const move = (next: number): void => {
    const count = options.length
    if (count === 0) return
    setActive(((next % count) + count) % count)
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      close(true)
      return
    }
    if (e.key === 'Tab') {
      /* Leaving the surface folds it. Never let the hand slip to the surface behind while it stays open */
      close(false)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      move(active + 1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      move(active - 1)
    } else if (e.key === 'Home') {
      e.preventDefault()
      move(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      move(options.length - 1)
    }
  }

  return (
    <Group ref={groupRef}>
      <Main {...rest}>{children}</Main>
      <Caret
        ref={caretRef}
        color={color}
        variant={variant}
        size={size}
        open={open}
        disabled={menuDisabled}
        aria-label={menuTitle}
        aria-haspopup="menu"
        aria-expanded={open}
        title={menuTitle}
        onClick={() => {
          if (open) {
            close(true)
            return
          }
          /* Reset to the current value on every open (what is in effect now, not where the hand last was) */
          setActive(current)
          setOpen(true)
        }}
      >
        {caret}
      </Caret>

      {open &&
        createPortal(
          <Panel
            ref={panelRef}
            role="menu"
            aria-label={menuTitle}
            tabIndex={-1}
            onKeyDown={onKeyDown}
            style={{
              top: at?.top ?? 0,
              right: at?.right ?? 0,
              // The placement is unknown until measured. Don't show it before then (no flash at the top-left)
              visibility: at ? 'visible' : 'hidden'
            }}
          >
            {options.map((option, index) => (
              <Row
                key={String(option.value)}
                ref={(el: HTMLButtonElement | null) => {
                  rowRefs.current[index] = el
                }}
                type="button"
                role="menuitemradio"
                aria-checked={option.value === selected}
                on={index === active}
                disabled={option.disabled}
                tabIndex={index === active ? 0 : -1}
                /* Even with a pointer the hand is one. Move the hand to the hovered row (the background never shows on 2 rows) */
                onPointerEnter={() => !option.disabled && setActive(index)}
                onClick={() => {
                  onSelect(option.value)
                  close(true)
                }}
              >
                {option.icon && <RowIcon data-icon>{option.icon}</RowIcon>}
                <RowLabel>{option.label}</RowLabel>
                {option.value === selected && <Check />}
              </Row>
            ))}
          </Panel>,
          document.body
        )}
    </Group>
  )
}
