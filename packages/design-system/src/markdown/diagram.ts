import type { Theme } from '@mui/material/styles'

/**
 * Draw Mermaid diagrams.
 *
 * mermaid itself is heavy, so **it is not loaded until a diagram shows up** (dynamic
 * import). A task whose conversation has no diagram at all loads not one byte of it.
 *
 * The configuration lives in exactly one place (here). mermaid's configuration is
 * global, so touching it piecemeal from a component affects how the neighbouring
 * diagram is drawn.
 */

type Mermaid = typeof import('mermaid').default

let loading: Promise<Mermaid> | null = null
/** Which color scheme it is currently initialized for. Reconfigured only when that changes */
let configured: string | null = null

async function load(): Promise<Mermaid> {
  loading ??= import('mermaid').then((m) => m.default)
  return loading
}

/**
 * Feed the colors from the Theme's tokens.
 *
 * `theme: 'base'` is the base for "decide it by variables". Pick `dark` / `default`
 * and mermaid's own palette rides in, making that one spot inside the app look like a
 * different app.
 */
function variables(theme: Theme): Record<string, string> {
  const { palette } = theme
  const line = palette.border.strong
  const face = palette.surface.raised
  const text = palette.text.primary

  return {
    darkMode: String(palette.mode === 'dark'),
    background: palette.surface.subtle,
    fontFamily: theme.typography.fontFamily ?? 'sans-serif',
    fontSize: '12px',

    // Nodes and surfaces
    primaryColor: face,
    primaryTextColor: text,
    primaryBorderColor: line,
    secondaryColor: palette.surface.default,
    secondaryTextColor: text,
    secondaryBorderColor: line,
    tertiaryColor: palette.surface.subtle,
    tertiaryTextColor: palette.text.secondary,
    tertiaryBorderColor: palette.border.subtle,
    mainBkg: face,
    nodeBorder: line,
    nodeTextColor: text,
    clusterBkg: palette.surface.default,
    clusterBorder: palette.border.subtle,
    titleColor: text,

    // Lines, and the text that goes alongside them
    lineColor: line,
    textColor: text,
    edgeLabelBackground: palette.surface.subtle,
    labelColor: text,
    labelTextColor: text,
    labelBoxBkgColor: palette.surface.default,
    labelBoxBorderColor: palette.border.subtle,

    // Sequence diagrams
    actorBkg: face,
    actorBorder: line,
    actorTextColor: text,
    actorLineColor: palette.border.subtle,
    signalColor: text,
    signalTextColor: text,
    loopTextColor: palette.text.secondary,
    activationBkgColor: palette.surface.default,
    activationBorderColor: line,
    sequenceNumberColor: palette.primary.contrastText,
    noteBkgColor: palette.surface.default,
    noteBorderColor: palette.border.subtle,
    noteTextColor: palette.text.primary,

    // State, class, ER
    altBackground: palette.surface.default,
    classText: text,
    attributeBackgroundColorOdd: palette.surface.default,
    attributeBackgroundColorEven: palette.surface.subtle,

    // Gantt and pie
    sectionBkgColor: palette.surface.default,
    sectionBkgColor2: palette.surface.subtle,
    altSectionBkgColor: palette.surface.subtle,
    gridColor: palette.border.subtle,
    doneTaskBkgColor: palette.surface.hover,
    taskTextColor: text,
    taskTextOutsideColor: text,
    pieTitleTextColor: text,
    pieSectionTextColor: palette.text.inverse,
    pieStrokeColor: palette.surface.subtle,
    pieOuterStrokeColor: palette.border.subtle,
    // Pie charts and quadrants need their areas told apart by color. Line the named colors up as they are
    pie1: palette.accents.blue,
    pie2: palette.accents.green,
    pie3: palette.accents.amber,
    pie4: palette.accents.violet,
    pie5: palette.accents.red,
    pie6: palette.accents.slate,

    // Only trouble is said in color
    errorBkgColor: palette.error.main,
    errorTextColor: palette.text.inverse
  }
}

export interface DiagramResult {
  svg: string
  error: string
}

export async function renderDiagram(
  source: string,
  id: string,
  theme: Theme
): Promise<DiagramResult> {
  try {
    const mermaid = await load()
    const key = `${theme.palette.mode}`
    if (configured !== key) {
      mermaid.initialize({
        startOnLoad: false,
        // Do not let it interpret the text. Strings arriving in a conversation are treated as written by someone else
        securityLevel: 'strict',
        // Stop mermaid from injecting its "bomb" graphic into body when it cannot draw
        suppressErrorRendering: true,
        theme: 'base',
        themeVariables: variables(theme),
        fontFamily: theme.typography.fontFamily,
        /*
         * Text inside a diagram is aligned to the body's 12px.
         * mermaid carries a different default per diagram kind (14-16px), and
         * `themeVariables.fontSize` alone leaves sequence diagrams oversized
         */
        fontSize: 12,
        /*
         * Do not let it shrink to the surface width (shrinking makes only the text
         * inside the diagram smaller). Spacing is tighter than mermaid's defaults —
         * this is a diagram placed inside a conversation, and if it does not fit on
         * one screen it cannot be read together with the text around it (rule I)
         */
        flowchart: {
          useMaxWidth: false,
          htmlLabels: false,
          curve: 'basis',
          nodeSpacing: 30,
          rankSpacing: 38,
          padding: 10,
          diagramPadding: 4
        },
        sequence: {
          useMaxWidth: false,
          diagramMarginX: 8,
          diagramMarginY: 8,
          boxMargin: 8,
          messageMargin: 28,
          noteMargin: 8,
          width: 120,
          height: 32,
          actorFontSize: 12,
          actorFontWeight: 500,
          messageFontSize: 12,
          messageFontWeight: 400,
          noteFontSize: 12,
          actorFontFamily: theme.typography.fontFamily,
          messageFontFamily: theme.typography.fontFamily,
          noteFontFamily: theme.typography.fontFamily
        },
        gantt: { useMaxWidth: false },
        journey: { useMaxWidth: false },
        class: { useMaxWidth: false },
        state: { useMaxWidth: false },
        er: { useMaxWidth: false },
        pie: { useMaxWidth: false }
      })
      configured = key
    }

    // Check it parses first. Asking it to draw something unparseable leaves debris in the DOM
    await mermaid.parse(source)
    const { svg } = await mermaid.render(`diagram-${id}`, source)
    return { svg, error: '' }
  } catch (error) {
    return { svg: '', error: error instanceof Error ? error.message : String(error) }
  }
}
