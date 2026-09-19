import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent
} from 'react'
import { alpha, styled, useTheme } from '@mui/material/styles'
import type { ThemedToken } from 'shiki'
import { blockProps } from '../../theme/styled.js'
import { highlightCode } from '../../markdown/highlight.js'
import { resolveLanguage } from '../../markdown/language.js'

export interface DiffViewLine {
  kind: 'context' | 'added' | 'deleted' | 'hunk'
  oldLine: number | null
  newLine: number | null
  text: string
}

export interface DiffViewProps {
  lines: DiffViewLine[]
  language?: string
  /** An action on a line (a PR comment, say). Called only for lines that have a newLine. */
  onLineClick?(
    line: number,
    event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>
  ): void
  selectedLine?: number | null
  onSelectedLineChange?(line: number): void
}

const Root = styled('div')(({ theme }) => ({
  flex: '1 1 auto',
  minWidth: 0,
  minHeight: 0,
  overflow: 'auto',
  background: theme.palette.surface.canvas,
  color: theme.palette.syntax.plain,
  fontFamily: theme.typography.fontFamilyMono,
  ...theme.typography.caption,
  lineHeight: 1.65,
  userSelect: 'text'
}))

const Line = styled('button', { shouldForwardProp: blockProps('kind', 'selected', 'actionable') })<{
  kind: DiffViewLine['kind']
  selected?: boolean
  actionable?: boolean
}>(({ theme, kind, selected, actionable }) => ({
  display: 'grid',
  width: '100%',
  padding: 0,
  border: 0,
  color: 'inherit',
  font: 'inherit',
  textAlign: 'left',
  gridTemplateColumns: `${theme.spacing(11)} ${theme.spacing(11)} ${theme.spacing(4)} minmax(max-content, 1fr)`,
  minHeight: theme.density.row.sm,
  background:
    kind === 'added'
      ? alpha(theme.palette.success.main, 0.1)
      : kind === 'deleted'
        ? alpha(theme.palette.error.main, 0.1)
        : kind === 'hunk'
          ? alpha(theme.palette.info.main, 0.08)
          : selected
            ? theme.palette.surface.selected
            : 'transparent',
  boxShadow: selected ? `inset 2px 0 ${theme.palette.primaryText}` : undefined,
  cursor: actionable ? 'pointer' : 'text',
  '&:hover': actionable ? { background: theme.palette.surface.hover } : undefined
}))

const NumberCell = styled('span')(({ theme }) => ({
  padding: `0 ${theme.spacing(2)}`,
  color: theme.palette.text.tertiary,
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
  userSelect: 'none'
}))

const Mark = styled('span')(({ theme }) => ({
  color: theme.palette.text.tertiary,
  textAlign: 'center',
  userSelect: 'none'
}))

const CodeCell = styled('span')(({ theme }) => ({
  minWidth: '100%',
  paddingRight: theme.spacing(4),
  whiteSpace: 'pre'
}))

function tokenStyle(token: ThemedToken): CSSProperties {
  const font = token.fontStyle ?? 0
  return {
    color: token.color,
    fontStyle: (font & 1) === 1 ? 'italic' : undefined,
    fontWeight: (font & 2) === 2 ? 600 : undefined,
    textDecoration: (font & 4) === 4 ? 'underline' : undefined
  }
}

/** A code view that puts line numbers, the diff background and TextMate grammar colors on one surface. */
export function DiffView({
  lines,
  language = '',
  onLineClick,
  selectedLine,
  onSelectedLineChange
}: DiffViewProps): JSX.Element {
  const theme = useTheme()
  const rootRef = useRef<HTMLDivElement>(null)
  const grammar = resolveLanguage(language)
  const code = useMemo(() => lines.map((line) => line.text).join('\n'), [lines])
  const [tokens, setTokens] = useState<ThemedToken[][] | null>(null)
  const selectable = useMemo(
    () => lines.flatMap((line) => (line.newLine !== null && line.kind !== 'deleted' ? [line.newLine] : [])),
    [lines]
  )

  useEffect(() => {
    if (!grammar) {
      setTokens(null)
      return
    }
    let alive = true
    void highlightCode(code, grammar, theme.palette.mode).then((result) => {
      if (alive) setTokens(result)
    })
    return () => {
      alive = false
    }
  }, [code, grammar, theme.palette.mode])

  useEffect(() => {
    if (selectedLine === null || selectedLine === undefined) return
    rootRef.current
      ?.querySelector<HTMLElement>(`[data-new-line="${String(selectedLine)}"]`)
      ?.scrollIntoView({ block: 'center' })
  }, [selectedLine])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (!onSelectedLineChange || selectable.length === 0) return
    const current = selectedLine === null || selectedLine === undefined ? -1 : selectable.indexOf(selectedLine)
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      const next = current < 0 ? (step > 0 ? 0 : selectable.length - 1) : Math.max(0, Math.min(selectable.length - 1, current + step))
      onSelectedLineChange(selectable[next])
      return
    }
    if (event.key === 'Enter' && selectedLine && onLineClick) {
      event.preventDefault()
      onLineClick(selectedLine, event)
    }
  }

  return (
    <Root ref={rootRef} tabIndex={onSelectedLineChange ? 0 : undefined} onKeyDown={onKeyDown}>
      {lines.map((line, index) => {
        const actionable = onLineClick !== undefined && line.newLine !== null && line.kind !== 'deleted'
        const body = tokens?.[index]
        return (
          <Line
            // The same new line can appear next to a deleted line, so the index is part of the key too
            key={`${line.oldLine ?? '-'}:${line.newLine ?? '-'}:${index}`}
            type="button"
            tabIndex={-1}
            aria-disabled={!actionable}
            data-new-line={line.newLine ?? undefined}
            kind={line.kind}
            selected={line.newLine !== null && selectedLine === line.newLine}
            actionable={actionable}
            onClick={actionable ? (event) => onLineClick(line.newLine!, event) : undefined}
          >
            <NumberCell>{line.oldLine ?? ''}</NumberCell>
            <NumberCell>{line.newLine ?? ''}</NumberCell>
            <Mark>
              {line.kind === 'added' ? '+' : line.kind === 'deleted' ? '-' : line.kind === 'hunk' ? '@' : ''}
            </Mark>
            <CodeCell>
              {body
                ? body.map((token, tokenIndex) => (
                    <span key={tokenIndex} style={tokenStyle(token)}>
                      {token.content}
                    </span>
                  ))
                : line.text}
            </CodeCell>
          </Line>
        )
      })}
    </Root>
  )
}
