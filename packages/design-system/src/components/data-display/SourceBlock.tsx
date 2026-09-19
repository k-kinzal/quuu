import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { styled, useTheme, type SxProps, type Theme } from '@mui/material/styles'
import type { ThemedToken } from 'shiki'
import { blockProps } from '../../theme/styled.js'
import { resolveLanguage } from '../../markdown/language.js'
import { highlightCode } from '../../markdown/highlight.js'

/**
 * The surface for code.
 *
 * What sets it apart from raw output (`CodeBlock`) is that it **has highlighting and a
 * heading**. Highlighting is left to shiki (the same TextMate grammars as VS Code).
 * Approximating it with hand-written regexes produces lying colors, language by
 * language.
 *
 * As a surface it is treated as **one step laid on the paper** (a 1px rule + a
 * background one step darker). No shadow — it is not a floating surface, so the
 * techniques are not mixed (rule L-5).
 */

export interface SourceBlockProps {
  code: string
  /** The language written on the fence. Empty means no highlighting and no heading */
  language?: string
  /** A caller-owned heading also identifies plain output without a language. */
  label?: string
  /** Embedded code uses its enclosing surface instead of drawing another frame. */
  appearance?: 'standalone' | 'embedded'
  tone?: 'default' | 'danger'
  /** Anything past this scrolls inside this surface only */
  maxHeight?: number
  /** What sits to the right of the heading (copy, and the like). The glyphs come from the app */
  actions?: ReactNode
  sx?: SxProps<Theme>
}

const Root = styled('div', { shouldForwardProp: blockProps('appearance') })<{
  appearance: 'standalone' | 'embedded'
}>(({ theme, appearance }) => ({
  minWidth: 0,
  border: appearance === 'standalone' ? `1px solid ${theme.palette.border.subtle}` : 0,
  borderRadius: appearance === 'standalone' ? theme.radius.sm : 0,
  background: appearance === 'standalone' ? theme.palette.surface.subtle : 'transparent',
  overflow: 'hidden'
}))

const Head = styled('div', { shouldForwardProp: blockProps('appearance') })<{
  appearance: 'standalone' | 'embedded'
}>(({ theme, appearance }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: theme.spacing(2),
  height: theme.density.row.xs,
  padding: `0 ${theme.spacing(1)} 0 ${theme.spacing(2)}`,
  borderBottom: appearance === 'standalone' ? `1px solid ${theme.palette.border.subtle}` : 0,
  ...theme.typography.caption,
  color: theme.palette.text.tertiary
}))

const HeadMeta = styled('span')(({ theme }) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: theme.spacing(2)
}))

const Pre = styled('pre', { shouldForwardProp: blockProps('tone', 'maxHeight') })<{
  tone: 'default' | 'danger'
  maxHeight: number
}>(({ theme, tone, maxHeight }) => ({
  margin: 0,
  padding: theme.spacing(2),
  ...theme.typography.caption,
  // Typography variants include the body family; code must override it last.
  fontFamily: theme.typography.fontFamilyMono,
  lineHeight: 1.65,
  maxHeight,
  overflow: 'auto',
  // No horizontal scrolling either. A conversation surface changes width, so wrapping reads better
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  userSelect: 'text',
  color: tone === 'danger' ? theme.palette.error.main : theme.palette.syntax.plain
}))

/** shiki's font style flags (bits). italic=1 / bold=2 / underline=4 */
function tokenStyle(token: ThemedToken): CSSProperties {
  const font = token.fontStyle ?? 0
  return {
    color: token.color,
    fontStyle: (font & 1) === 1 ? 'italic' : undefined,
    fontWeight: (font & 2) === 2 ? 600 : undefined,
    textDecoration: (font & 4) === 4 ? 'underline' : undefined
  }
}

export function SourceBlock({
  code,
  language = '',
  label,
  appearance = 'standalone',
  tone = 'default',
  maxHeight = 420,
  actions,
  sx
}: SourceBlockProps): JSX.Element {
  const theme = useTheme()
  const scheme = theme.palette.mode
  const grammar = tone === 'danger' ? null : resolveLanguage(language)
  const [lines, setLines] = useState<ThemedToken[][] | null>(null)

  /*
   * Highlighting involves loading a grammar, so it is asynchronous.
   * **The body is rendered in the same shape while we wait** (only the color arrives
   * later). To keep the lines from shifting on swap, the replacement happens inside the
   * same `pre` as the plain rendering
   */
  useEffect(() => {
    if (!grammar) {
      setLines(null)
      return
    }
    let alive = true
    void highlightCode(code, grammar, scheme).then((result) => {
      if (alive) setLines(result)
    })
    return () => {
      alive = false
    }
  }, [code, grammar, scheme])

  return (
    <Root sx={sx} appearance={appearance} role={label ? 'region' : undefined} aria-label={label}>
      {(label || language !== '' || actions) && (
        <Head appearance={appearance}>
          <span>{label ?? (grammar ?? language.trim().toLowerCase())}</span>
          <HeadMeta>
            {label && language !== '' && <span>{grammar ?? language.trim().toLowerCase()}</span>}
            {actions}
          </HeadMeta>
        </Head>
      )}
      <Pre tone={tone} maxHeight={maxHeight}>
        {lines === null
          ? code
          : lines.map((tokens, i) => (
              <span key={i}>
                {tokens.map((token, j) => (
                  <span key={j} style={tokenStyle(token)}>
                    {token.content}
                  </span>
                ))}
                {i < lines.length - 1 ? '\n' : ''}
              </span>
            ))}
      </Pre>
    </Root>
  )
}
