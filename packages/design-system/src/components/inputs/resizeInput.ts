import { feedbackMetrics } from '../../theme/feedback.js'
export interface GrowableInput {
  value: string
  scrollHeight: number
  style: { height: string }
}
/** A restored draft gets the same height it had while being typed. The actual ceiling is decided by what the input is for. */
export function resizeInput(
  el: GrowableInput | null,
  kind: 'message' | 'draft' | 'compact' | 'document' = 'message'
): void {
  if (!el) return
  if (el.value.length === 0 && kind !== 'document') {
    el.style.height = ''
    return
  }
  const max =
    kind === 'document'
      ? Infinity
      : kind === 'draft'
        ? feedbackMetrics.composer.draftHeight
        : kind === 'compact'
          ? feedbackMetrics.composer.compactHeight
          : feedbackMetrics.composer.messageHeight
  el.style.height = 'auto'
  el.style.height = `${Math.min(max, el.scrollHeight)}px`
}
