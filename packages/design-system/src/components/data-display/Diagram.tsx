import { useEffect, useId, useState } from 'react'
import { styled, useTheme, type SxProps, type Theme } from '@mui/material/styles'
import { renderDiagram } from '../../markdown/diagram.js'

/**
 * Draws diagrams (Mermaid).
 *
 * Rendering is left to mermaid itself. The notation is broad (flowchart /
 * sequence / class / state / ER / gantt / pie / journey / quadrant …) and grows
 * with every release, so a home-grown approximation makes **the line between
 * drawable and not drawable an artifact of our convenience.**
 *
 * No colors of its own. A diagram is a "thing to read" like code, not a state,
 * so coloring nodes makes a meaningless color scheme the strongest signal on
 * screen (convention L). Theme variables come from the Theme tokens.
 */

export interface DiagramProps {
  /** The Mermaid notation itself */
  source: string
  /** Description for screen readers. A diagram's meaning only carries in prose */
  label?: string
  /** What to show when drawing fails (show the code as-is) */
  fallback?: (error: string) => JSX.Element
  sx?: SxProps<Theme>
}

const Root = styled('div')(({ theme }) => ({
  overflowX: 'auto',
  padding: theme.spacing(2),
  border: `1px solid ${theme.palette.border.subtle}`,
  borderRadius: theme.radius.sm,
  background: theme.palette.surface.subtle,
  // Strip the `max-width` mermaid adds. Scrolling sideways reads better than shrinking text into mush
  '& svg': { display: 'block', maxWidth: 'none !important', height: 'auto' }
}))

type State =
  | { kind: 'pending' }
  | { kind: 'drawn'; svg: string }
  | { kind: 'failed'; error: string }

export function Diagram({ source, label, fallback, sx }: DiagramProps): JSX.Element | null {
  // Theme is kept to one instance per color scheme (`ThemeProvider`'s useMemo),
  // so having it as a dependency only redraws when the scheme changes
  const theme = useTheme()
  // mermaid looks elements up by id, so use a value that won't collide when the same diagram appears twice
  const id = useId().replace(/:/g, '')
  const [state, setState] = useState<State>({ kind: 'pending' })

  useEffect(() => {
    let alive = true
    void renderDiagram(source, id, theme).then((result) => {
      if (!alive) return
      setState(
        result.svg ? { kind: 'drawn', svg: result.svg } : { kind: 'failed', error: result.error }
      )
    })
    return () => {
      alive = false
    }
  }, [source, id, theme])

  if (state.kind === 'failed') return fallback ? fallback(state.error) : null

  return (
    <Root
      sx={sx}
      role="img"
      aria-label={label ?? 'diagram'}
      /*
       * mermaid outputs SVG. It passes through DOMPurify under
       * `securityLevel: 'strict'`, so text is escaped, not interpreted
       * (configured in `diagram.ts`)
       */
      dangerouslySetInnerHTML={{ __html: state.kind === 'drawn' ? state.svg : '' }}
    />
  )
}
