import type { Theme } from '@mui/material/styles'

/** Supplementary action logs keep their hue without competing with the conversation body. */
export function transcriptColor(theme: Theme, color: string): string {
  return `color-mix(in oklab, ${color} 35%, ${theme.palette.text.tertiary})`
}

/** Display rules returned from consumers. Keeps the per-use relationships and hands no actual sizes to screens. */
export const feedbackMetrics = {
  transcript: { labelWidth: 44, indent: 52 },
  history: { resultWidth: 48, durationWidth: 72, chainIndent: 52 },
  attributes: { labelWidth: 80, shortLabelWidth: 64, dataLabelWidth: 72 },
  preview: { imageHeight: 240, codeHeight: 280 },
  detail: { minHeight: 132 },
  composer: { messageHeight: 240, draftHeight: 200, compactHeight: 132 },
  searchPicker: { width: 300, height: 280 },
  opacity: { secondary: 0.74, subdued: 0.65 },
  tint: { pending: 0.12, message: 0.14, quotation: 0.08 },
  decoration: { underlineOffset: 3 },
  dot: { regular: 7, emphasized: 8 },
  fontWeight: { bold: 600 },
  motion: {
    pressMs: 120,
    slideMs: 220,
    navigationMs: 380,
    minimumMs: 150,
    ease: 'cubic-bezier(0.32, 0.72, 0, 1)',
    parallax: 0.3,
    dim: 0.2
  },
  gesture: { edge: 28, slop: 8, commit: 0.33, flick: 0.35, actionWidth: 88 },
  badge: { offset: 6 },
  progress: { height: 2 }
} as const

/** The gaps available when composing parts. Keeps consumers from writing arbitrary multipliers. */
export const compositionSpace = {
  none: 0,
  hairline: 0.25,
  xxs: 0.5,
  xs: 1,
  icon: 1.25,
  sm: 1.5,
  md: 2,
  lg: 3,
  xl: 4,
  xxl: 5
} as const
