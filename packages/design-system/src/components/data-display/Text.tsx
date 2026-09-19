import { styled, type Theme } from '@mui/material/styles'
import { blockProps } from '../../theme/styled.js'
import { fontSize, lineHeight } from '../../theme/tokens.js'

/** The steps of the type scale. No screen may name a size outside these. */
export type TextSize = keyof typeof fontSize

/**
 * What the text means.
 *
 * Takes only the rank of the information (primary / secondary / tertiary) and MUI's
 * semantic colors. Domain words like "awaiting review" do not go here — the caller maps
 * its own states onto the semantic colors. An arbitrary color goes through the `color`
 * prop.
 */
export type TextTone =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'inverse'
  | 'accent'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger'

export interface TextProps {
  size?: TextSize
  tone?: TextTone
  /** A color not in `tone`. Used to pass an app's own domain color */
  color?: string
  weight?: 'regular' | 'medium' | 'bold'
  leading?: keyof typeof lineHeight
  /**
   * Make it monospaced. An explicit `false` returns to the body face even inside a
   * monospaced surface
   */
  mono?: boolean
  /** Numbers. Keeps the position steady as the digit count changes */
  tabular?: boolean
  /**
   * Fit it on one line. Always give a truncated element a `title`.
   * `start` truncates the head and keeps the tail (a file name, say)
   */
  truncate?: boolean | 'start'
  /** A surface to read. Make it copyable */
  selectable?: boolean
  /** Emit line breaks as they are */
  preWrap?: boolean
  block?: boolean
  italic?: boolean
  /** Strikethrough. Marks something that is over */
  strike?: boolean
  grow?: boolean
  fixed?: boolean
  fill?: boolean
  align?: 'left' | 'center' | 'right'
}

const TONE: Record<TextTone, (t: Theme) => string> = {
  primary: (t) => t.palette.text.primary,
  secondary: (t) => t.palette.text.secondary,
  tertiary: (t) => t.palette.text.tertiary,
  inverse: (t) => t.palette.text.inverse,
  accent: (t) => t.palette.primaryText,
  info: (t) => t.palette.info.main,
  success: (t) => t.palette.success.main,
  warning: (t) => t.palette.warning.main,
  danger: (t) => t.palette.error.main
}

const WEIGHT = { regular: 400, medium: 500, bold: 600 } as const

export function textStyles(theme: Theme, props: TextProps): Record<string, unknown> {
  return {
    fontSize: props.size
      ? theme.typography[
          ({ xs: 'caption', sm: 'body2', md: 'body1', lg: 'subtitle2', xl: 'h6' } as const)[
            props.size
          ]
        ].fontSize
      : undefined,
    lineHeight: props.leading ? lineHeight[props.leading] : undefined,
    color: props.color ?? (props.tone ? TONE[props.tone](theme) : undefined),
    fontWeight: props.weight ? WEIGHT[props.weight] : undefined,
    fontFamily:
      props.mono === undefined
        ? undefined
        : props.mono
          ? theme.typography.fontFamilyMono
          : theme.typography.fontFamily,
    fontVariantNumeric: props.tabular ? 'tabular-nums' : undefined,
    fontStyle: props.italic ? 'italic' : undefined,
    textDecoration: props.strike ? 'line-through' : undefined,
    display: props.block ? 'block' : undefined,
    flex: props.grow ? '1 1 auto' : props.fixed ? '0 0 auto' : undefined,
    width: props.fill ? '100%' : undefined,
    minWidth: props.grow ? 0 : undefined,
    textAlign: props.align,
    userSelect: props.selectable ? 'text' : undefined,
    whiteSpace: props.preWrap ? 'pre-wrap' : props.truncate ? 'nowrap' : undefined,
    wordBreak: props.preWrap ? 'break-word' : undefined,
    ...(props.truncate
      ? {
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          ...(props.truncate === 'start' ? { direction: 'rtl', textAlign: 'left' } : {})
        }
      : {})
  }
}

/**
 * The one and only entrance for deciding how text looks.
 *
 * Writing size, color and leading out per screen makes the density drift from place to
 * place. Express it only with the vocabulary taken here (`size` / `tone` / `leading`).
 */
export const Text = styled('span', {
  shouldForwardProp: blockProps(
    'size',
    'tone',
    'color',
    'weight',
    'leading',
    'mono',
    'tabular',
    'truncate',
    'selectable',
    'preWrap',
    'block',
    'italic',
    'strike',
    'grow',
    'fixed',
    'fill',
    'align'
  )
})<TextProps>(({ theme, ...props }) => textStyles(theme, props))

/** A paragraph. It is a surface to read, so it keeps its leading and measure. */
export const Paragraph = styled('p', { shouldForwardProp: blockProps('measured') })<{
  /** Cap the line length. Used on surfaces where prose is the main thing */
  measured?: boolean
}>(({ theme, measured = true }) => ({
  margin: 0,
  ...theme.typography.body1,
  lineHeight: lineHeight.read,
  maxWidth: measured ? theme.measure : undefined
}))
