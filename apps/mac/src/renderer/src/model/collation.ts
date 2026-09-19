import { LANGUAGE } from './i18n/index.js'

/**
 * Ordering words for display, in the language the screens are in.
 *
 * Sort order is part of what a reader can scan. Collate in a fixed language and one
 * audience always reads a list ordered by rules that are not theirs: Japanese titles
 * sorted by English rules do not group by kana, and English titles sorted by Japanese
 * rules put familiar names in unfamiliar places.
 *
 * `numeric` so `run 2` precedes `run 10`, and `sensitivity: 'base'` so case and width
 * differences do not split otherwise-identical names apart.
 */
const collator = new Intl.Collator(LANGUAGE, { numeric: true, sensitivity: 'base' })

export function compareText(a: string, b: string): number {
  return collator.compare(a, b)
}
