import type { MouseEvent, ReactNode } from 'react'
import { alpha, styled, type Theme } from '@mui/material/styles'
import { blockProps, canHover } from '../../theme/styled.js'
import { fontWeight, lineHeight } from '../../theme/tokens.js'
import { Text } from '../data-display/Text.js'

/**
 * The composite input for the primary act.
 *
 * Not a lone textarea; it takes this three-part shape:
 *
 *   1. Context  … what sending this will do (target, conditions)
 *   2. Input    … grows automatically. Submitting is fixed to a single key
 *   3. Actions  … secondary actions / target switching / send
 *
 * The point is to show the conditions that shape the outcome before sending —
 * a vessel for never building an input where "you can't know what happens until
 * you press".
 *
 * Place exactly one per screen. If two seem needed, one of them can be demoted.
 */
export const Composer = styled('div', { shouldForwardProp: blockProps('pad') })<{ pad?: number }>(
  ({ theme, pad = 4 }) => ({
    flex: '0 0 auto',
    padding: `0 ${theme.spacing(pad)} ${theme.spacing(2)}`
  })
)

export const ComposerBox = styled('div', { shouldForwardProp: blockProps('busy') })<{
  busy?: boolean
}>(({ theme, busy }) => ({
  border: `1px solid ${theme.palette.border.strong}`,
  borderRadius: theme.radius.md,
  background: theme.palette.surface.default,
  overflow: 'hidden',
  transition: theme.transitions.create(['border-color', 'box-shadow'], { duration: theme.transitions.duration.shortest }),
  // Keep the body readable even while saving. Whether actions are available is told by the input and the main button.
  cursor: busy ? 'progress' : undefined,
  '&:focus-within': { borderColor: theme.palette.primaryText, boxShadow: `0 0 0 2px ${alpha(theme.palette.primaryText, 0.12)}` }
}))

/** 1. The context strip. */
export const ComposerContext = styled('div')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(1),
  flexWrap: 'wrap',
  padding: `${theme.spacing(1.5)} ${theme.spacing(2)} 0`,
  userSelect: 'none'
}))

/** Settings wrap together; the action group moves below them before their values get squeezed away. */
export const ComposerOptions = styled(ComposerContext)({ flex: '1 1 min-content', minWidth: 0, padding: 0 })

/** Keep related actions together and at the trailing edge when the band wraps. */
export const ComposerActions = styled('div')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  flexWrap: 'wrap',
  flex: '0 0 auto',
  maxWidth: '100%',
  marginLeft: 'auto',
  gap: theme.spacing(2)
}))

const chipProps = blockProps('warn', 'interactive')

const chipShape = ({
  theme,
  warn,
  interactive
}: {
  theme: Theme
  warn?: boolean
  interactive?: boolean
}): Record<string, unknown> => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: theme.spacing(1),
  minWidth: 0,
  maxWidth: 'min(100%, 24ch)',
  height: theme.density.control.xs,
  padding: `0 ${theme.spacing(1)}`,
  border: `1px solid ${warn ? alpha(theme.palette.warning.main, 0.45) : 'transparent'}`,
  /*
   * Not pills (rule M). Round lumps on top of a square input make the shape
   * stand out over the content — "where and with what this runs".
   * Their corners stay smaller than the enclosing input's corners.
   */
  borderRadius: theme.radius.sm,
  background: interactive ? alpha(theme.palette.text.primary, 0.04) : 'transparent',
  ...theme.typography.caption,
  color: warn ? theme.palette.warning.main : theme.palette.text.secondary,
  cursor: interactive ? 'pointer' : 'default',
  '& > svg': { flex: '0 0 auto', display: 'block' },
  transition: theme.transitions.create(['background-color', 'border-color', 'color'], { duration: theme.transitions.duration.shortest }),
  ...(interactive
    ? {
        [canHover]: { '&:hover': {
          background: theme.palette.surface.hover,
          borderColor: theme.palette.border.strong,
          color: theme.palette.text.primary
        } },
        '&:active': { background: theme.palette.surface.selected },
        '&:focus-visible': { outline: `2px solid ${theme.palette.primaryText}`, outlineOffset: -1 }
      }
    : {})
})

const ChipStatic = styled('span', { shouldForwardProp: chipProps })<{
  warn?: boolean
  interactive?: boolean
}>(chipShape)

const ChipButton = styled('button', { shouldForwardProp: chipProps })<{
  warn?: boolean
  interactive?: boolean
}>(chipShape)

export interface ContextChipProps {
  'aria-haspopup'?: React.AriaAttributes['aria-haspopup']
  'aria-expanded'?: boolean
  icon?: ReactNode
  children: ReactNode
  title?: string
  /** A short word marking a departure from the default. Omitted = not drawn */
  badge?: ReactNode
  /** A condition that shapes the outcome is unmet */
  warn?: boolean
  /** Passing this makes the chip pressable. Pressable = the value can be changed in place */
  onClick?(event: MouseEvent<HTMLElement>): void
  /**
   * Right-click. Can be passed to unpressable chips too
   * (a value you can't change may still be a value you can extract)
   */
  onContextMenu?(event: MouseEvent<HTMLElement>): void
}

/**
 * A chip that shows "where, with what, under which conditions" before sending.
 * Pressable ones are values that can change; unpressable ones are already decided
 * higher up the hierarchy.
 */
export function ContextChip({
  icon,
  children,
  title,
  badge,
  warn,
  onClick,
  onContextMenu,
  ...aria
}: ContextChipProps): JSX.Element {
  const body = (
    <>
      {icon}
      <Text truncate>{children}</Text>
      {badge}
    </>
  )
  return onClick ? (
    <ChipButton
      {...aria}
      type="button"
      interactive
      warn={warn}
      title={title}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      {body}
    </ChipButton>
  ) : (
    <ChipStatic warn={warn} title={title} onContextMenu={onContextMenu}>
      {body}
    </ChipStatic>
  )
}

/**
 * A note slotted above the input.
 * Holds what should share the input's field of view, like "what gets sent next".
 */
export const ComposerNotice = styled('div', { shouldForwardProp: blockProps('tone') })<{
  tone?: 'info' | 'warning' | 'danger'
}>(({ theme, tone = 'warning' }) => {
  const color =
    tone === 'info'
      ? theme.palette.info.main
      : tone === 'danger'
        ? theme.palette.error.main
        : theme.palette.warning.main
  return {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    margin: '6px 8px 0',
    padding: '6px 8px',
    borderLeft: `2px solid ${color}`,
    borderRadius: theme.radius.sm,
    background: alpha(color, 0.08),
    color: theme.palette.text.secondary,
    '& > svg': { flex: '0 0 auto', marginTop: 2, color }
  }
})

/** The note's content. Its length is unknowable, so only this column shrinks. */
export const ComposerNoticeBody = styled('div')({ flex: '1 1 auto', minWidth: 0 })

/** The note's body text. It can grow long, so cap it and scroll only there. */
export const ComposerNoticeText = styled('div')(({ theme }) => ({
  maxHeight: 72,
  overflowY: 'auto',
  ...theme.typography.body2,
  whiteSpace: 'pre-wrap',
  color: theme.palette.text.primary,
  userSelect: 'text'
}))

/**
 * 2'. The row that shows the first line settled as the "name".
 *
 * When one input field takes both a name and a body, don't explain the rule in a
 * caption. The moment writing enters the second line, move the first line into this
 * row and **show by shape that it has settled**. A change of shape is faster than
 * prose, and catches the eye even mid-writing.
 *
 * Put a `PlainInput` inside. Focus state belongs to the vessel (`ComposerBox`),
 * so all this adds is the boundary with the body and one step more weight.
 */
export const ComposerSubject = styled('div')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(2),
  margin: `${theme.spacing(1.5)} ${theme.spacing(2)} 0`,
  paddingBottom: theme.spacing(1.5),
  borderBottom: `1px solid ${theme.palette.border.subtle}`,
  /* The short name on the left never shrinks (shrunk, the body steals its width and the word wraps) */
  '& > span': { flex: '0 0 auto' },
  /* Read as a settled heading. At the body's weight it looks like just another first line */
  '& > input': { fontWeight: fontWeight.medium }
}))

/** 2. The input. Grows automatically; once it hits the cap, only it scrolls. */
export const ComposerInput = styled('textarea')(({ theme }) => ({
  display: 'block',
  width: '100%',
  minHeight: theme.density.control.lg,
  maxHeight: 240,
  padding: `${theme.spacing(1.5)} ${theme.spacing(2)}`,
  border: 0,
  background: 'transparent',
  fontFamily: 'inherit',
  fontSize: theme.typography.body1.fontSize,
  lineHeight: lineHeight.read,
  color: theme.palette.text.primary,
  resize: 'none',
  outline: 'none',
  '&::placeholder': { color: theme.palette.text.tertiary }
}))

/**
 * 3. The action strip. Secondary actions first, then the primary one.
 *
 * **There is no slot for writing what pressing will do.** Given a caption area, it
 * fills up with restatements of the button label ("sends once the run finishes") and
 * key guidance ("⌘↵ to send") — both things pressing would reveal, forced on the
 * reader beforehand. Outcomes are said by label and icon; keys by the OS menu and tooltip.
 */
export const ComposerToolbar = styled('div')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: theme.spacing(2),
  padding: `0 ${theme.spacing(2)} ${theme.spacing(1.5)}`
}))
