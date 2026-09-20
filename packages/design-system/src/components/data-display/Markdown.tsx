import { Children, isValidElement, useMemo, type ReactElement, type ReactNode } from 'react'
import { styled, type SxProps, type Theme } from '@mui/material/styles'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import { letterSpacing, lineHeight } from '../../theme/tokens.js'
import { isDiagramLanguage } from '../../markdown/language.js'
import { safeUrl } from '../../markdown/url.js'
import { localPathUrl, remarkLocalPaths } from '../../markdown/localPaths.js'
import { Diagram } from './Diagram.js'
import { SourceBlock } from './SourceBlock.js'

/**
 * Renders Markdown as a reading surface.
 *
 * Conversation bodies arrive written in Markdown. Shown as raw characters,
 * a heading's `#` and a table's `|` sit with the same weight as the prose, and
 * **information that should read as structure becomes noise.** This restores the structure.
 *
 * Parsing is left to remark (a CommonMark + GFM implementation). The corners of
 * the notation (nested lists, reference links, footnotes, code inside tables)
 * are finely specified; a home-grown regex always breaks somewhere.
 *
 * Only two rules decide the look:
 * - **Hierarchy is built from weight and color.** The type scale has only 5 steps,
 *   so making headings bigger never reaches the reader (convention M)
 * - **Invent no new colors.** Use the 3 text tiers and the primary color;
 *   code coloring is `palette.syntax`
 *
 * Raw HTML is not rendered (react-markdown's default). Putting conversation
 * strings straight into the DOM breaks palette and spacing, and opens an
 * injection door.
 */

export interface MarkdownProps {
  children: string
  /**
   * Called when a link is pressed. Without it links come out as plain text
   * (the design system has no means of "opening something external")
   */
  onOpenLink?: (href: string) => void
  /** Opt in to linking absolute and home-relative paths; the host owns opening them. */
  onOpenPath?: (href: string) => void
  /** What to place to the right of a code block's heading (copy, etc.) */
  codeActions?: (code: string, language: string) => ReactNode
  /** Render `mermaid` fences as diagrams. Defaults to rendering */
  diagrams?: boolean
  sx?: SxProps<Theme>
  /** Content read as an aside to the body. Screens must not override the font size. */
  subdued?: boolean
}

export function Markdown({
  children,
  onOpenLink,
  onOpenPath,
  codeActions,
  diagrams = true,
  sx,
  subdued
}: MarkdownProps): JSX.Element {
  const components = useMemo<Components>(
    () => build({ onOpenLink, onOpenPath, codeActions, diagrams }),
    [onOpenLink, onOpenPath, codeActions, diagrams]
  )

  return (
    <Root sx={sx} subdued={subdued}>
      <ReactMarkdown
        /*
         * GFM covers tables, strikethrough, checkboxes, footnotes, bare URLs.
         * breaks means "a single newline renders as a line break" — agent
         * utterances are often written as runs of lines, and joining them
         * erases the breaks in meaning
         */
        remarkPlugins={onOpenPath ? [remarkGfm, remarkBreaks, remarkLocalPaths] : [remarkGfm, remarkBreaks]}
        urlTransform={(url) => (onOpenPath ? localPathUrl(url) : null) ?? safeUrl(url) ?? ''}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </Root>
  )
}

/* ------------------------------------------------------------------ Look */

const Root = styled('div', { shouldForwardProp: (prop) => prop !== 'subdued' && prop !== 'sx' })<{
  subdued?: boolean
}>(({ theme, subdued }) => ({
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing(3),
  fontSize: subdued ? theme.typography.body2.fontSize : theme.typography.body1.fontSize,
  lineHeight: lineHeight.read,
  color: subdued ? theme.palette.text.tertiary : theme.palette.text.primary,
  wordBreak: 'break-word',
  userSelect: 'text',

  '& > *': { margin: 0 },

  /*
   * At most 3 heading tiers. Rank comes from weight and color, not size
   * (convention M). A heading inside a conversation is a divider, not a
   * cover page, so it doesn't get bigger
   */
  '& h1, & h2, & h3, & h4, & h5, & h6': {
    margin: 0,
    fontWeight: 600,
    lineHeight: lineHeight.tight
  },
  '& h1, & h2': {
    fontSize: theme.typography.subtitle2.fontSize,
    letterSpacing: letterSpacing.tight
  },
  '& h3': { fontSize: theme.typography.body1.fontSize },
  '& h4, & h5, & h6': {
    fontSize: theme.typography.body2.fontSize,
    color: theme.palette.text.secondary,
    letterSpacing: letterSpacing.wider
  },
  // A heading heads the next block. Push it away from the previous one so it doesn't read as a continuation
  '& > * + :is(h1, h2, h3, h4, h5, h6)': { marginTop: theme.spacing(2) },

  '& ul, & ol': {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1),
    margin: 0,
    paddingLeft: theme.spacing(5)
  },
  '& li': { margin: 0 },
  '& li > p': { margin: 0 },
  // In a loose list (items holding multiple paragraphs), separate the blocks inside
  '& li > p + *': { marginTop: theme.spacing(2) },
  '& li::marker': { color: theme.palette.text.tertiary },
  // Nesting indents by one step only. Growing the indent per level starves the right side
  '& li > ul, & li > ol': { marginTop: theme.spacing(1), paddingLeft: theme.spacing(4) },
  // Checkbox lists show no bullet. The mark is the checkbox itself
  '& li:has(> input[type="checkbox"])': { listStyle: 'none', marginLeft: `-${theme.spacing(4)}` },
  /*
   * The checkbox stays a plain checkbox as an element (keeping its screen-reader
   * and disabled semantics); only the look is drawn by hand. A disabled checkbox
   * sinks into OS-default gray, and "done / not yet" becomes unreadable
   */
  '& input[type="checkbox"]': {
    appearance: 'none',
    position: 'relative',
    width: 11,
    height: 11,
    margin: `0 ${theme.spacing(2)} 0 0`,
    verticalAlign: -1,
    border: `1px solid ${theme.palette.border.strong}`,
    borderRadius: theme.radius.xs,
    background: theme.palette.surface.raised,
    opacity: 1
  },
  '& input[type="checkbox"]:checked': {
    background: theme.palette.primary.main,
    borderColor: theme.palette.primary.main
  },
  '& input[type="checkbox"]:checked::after': {
    content: '""',
    position: 'absolute',
    left: 3,
    top: 0,
    width: 3,
    height: 6,
    border: `solid ${theme.palette.primary.contrastText}`,
    borderWidth: '0 1.5px 1.5px 0',
    transform: 'rotate(45deg)'
  },

  '& blockquote': {
    margin: 0,
    paddingLeft: theme.spacing(3),
    borderLeft: `2px solid ${theme.palette.border.subtle}`,
    color: theme.palette.text.secondary,
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(2)
  },

  '& hr': {
    border: 0,
    borderTop: `1px solid ${theme.palette.border.subtle}`,
    margin: `${theme.spacing(1)} 0`
  },

  '& a': {
    color: theme.palette.primaryText,
    textDecoration: 'none',
    cursor: 'pointer',
    '&:hover': { textDecoration: 'underline' }
  },

  '& code': {
    fontFamily: theme.typography.fontFamilyMono,
    fontSize: theme.typography.caption.fontSize,
    padding: '1px 4px',
    borderRadius: theme.radius.xs,
    background: theme.palette.surface.raised
  },

  '& strong': { fontWeight: 600 },
  '& em': { fontStyle: 'italic' },
  '& del': { color: theme.palette.text.tertiary },

  '& table': {
    borderCollapse: 'collapse',
    fontSize: theme.typography.body2.fontSize,
    lineHeight: lineHeight.base
  },
  '& th, & td': {
    padding: `2px ${theme.spacing(2)}`,
    border: `1px solid ${theme.palette.border.subtle}`,
    textAlign: 'left',
    verticalAlign: 'top'
  },
  '& th': {
    background: theme.palette.surface.subtle,
    fontWeight: 600,
    color: theme.palette.text.secondary,
    whiteSpace: 'nowrap'
  },

  // Footnotes are not body text. Lower their rank and put one rule at the break from the body
  '& .footnotes': {
    marginTop: theme.spacing(2),
    paddingTop: theme.spacing(2),
    borderTop: `1px solid ${theme.palette.border.subtle}`,
    ...theme.typography.body2,
    color: theme.palette.text.secondary
  },
  '& .footnotes h2': { ...theme.typography.caption, color: theme.palette.text.tertiary },
  '& sup a': { textDecoration: 'none' }
}))

/** A table's width can't be predicted. Overflow past the surface scrolls sideways here only */
const TableScroll = styled('div')({ overflowX: 'auto', maxWidth: '100%' })

/* ------------------------------------------------------------------ Assembly */

interface Config {
  onOpenLink?: (href: string) => void
  onOpenPath?: (href: string) => void
  codeActions?: (code: string, language: string) => ReactNode
  diagrams: boolean
}

function build({ onOpenLink, onOpenPath, codeActions, diagrams }: Config): Components {
  return {
    /*
     * Fenced code arrives as `pre > code`. Intercept on the `pre` side and replace
     * it whole (replacing on the `code` side nests diagrams and surfaces inside `pre`)
     */
    pre({ children }) {
      const { code, language } = readCodeChild(children)
      if (code === null) return <pre>{children}</pre>
      if (diagrams && isDiagramLanguage(language)) {
        return (
          <Diagram
            source={code}
            fallback={() => (
              <SourceBlock
                code={code}
                language={language}
                actions={codeActions?.(code, language)}
              />
            )}
          />
        )
      }
      return <SourceBlock code={code} language={language} actions={codeActions?.(code, language)} />
    },

    a({ href, children, title }) {
      const path = href === undefined || !onOpenPath ? null : localPathUrl(href)
      const url = path ?? (href === undefined ? null : safeUrl(href))
      const open = path === null ? onOpenLink : onOpenPath
      // Destinations without a host-provided opener stay as text.
      if (!open || url === null) return <>{children}</>
      return (
        <a
          href={url}
          title={title}
          onClick={(event) => {
            event.preventDefault()
            open(url)
          }}
        >
          {children}
        </a>
      )
    },

    // Images are never fetched (don't load whatever the conversation partner pointed at)
    img({ src, alt }) {
      const url = typeof src === 'string' ? safeUrl(src) : null
      const label = alt !== undefined && alt !== '' ? alt : (url ?? '')
      if (!onOpenLink || url === null) return <>{label}</>
      return (
        <a
          href={url}
          title={url}
          onClick={(event) => {
            event.preventDefault()
            onOpenLink(url)
          }}
        >
          {label}
        </a>
      )
    },

    table({ children }) {
      return (
        <TableScroll>
          <table>{children}</table>
        </TableScroll>
      )
    }
  }
}

/** Pulls the content and language out of `pre`'s child (the `code` element) */
function readCodeChild(children: ReactNode): { code: string | null; language: string } {
  const only = Children.toArray(children)[0]
  if (!isValidElement(only)) return { code: null, language: '' }
  const props = (only as ReactElement<{ className?: string; children?: ReactNode }>).props
  const language = /language-([\w+#.-]+)/.exec(props.className ?? '')?.[1] ?? ''
  const code = flatten(props.children)
  // Fence content carries a trailing newline. Drop it so no blank line forms under the surface
  return { code: code.replace(/\n$/, ''), language }
}

function flatten(node: ReactNode): string {
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(flatten).join('')
  if (isValidElement(node)) {
    return flatten((node as ReactElement<{ children?: ReactNode }>).props.children)
  }
  return ''
}
