import i18next from 'i18next'
import { en } from './en.js'
import { ja } from './ja.js'

/*
 * The screen's language follows the OS and is fixed for the process lifetime,
 * so it is resolved once, synchronously, when this module first evaluates.
 * Everything that renders copy (components, and the label tables in model/)
 * imports from here, which guarantees the language is known before any label
 * is computed — including labels held in module-level constants.
 */
// The `window` guard (not `navigator`, which Node ≥21 also defines and fills with
// the machine locale) keeps Node-side tests deterministic: no window → English.
// eslint-disable-next-line no-restricted-globals -- the display model owns the copy, so it must be the one place that knows the OS language
const language = typeof window === 'undefined' ? 'en' : navigator.language

const instance = i18next.createInstance()
void instance.init({
  lng: language,
  fallbackLng: 'en',
  resources: { en: { translation: en }, ja: { translation: ja } },
  // Values go into React elements / native menus, never into HTML strings.
  interpolation: { escapeValue: false },
  // All resources are bundled: init completes synchronously, t() is usable right away.
  initAsync: false
})

export const t = instance.t.bind(instance)

/** The language actually in use. Display code that sorts words collates in it. */
export const LANGUAGE = instance.resolvedLanguage ?? 'en'

/** For handing the matching design-system string pack to ThemeProvider. */
export const isJapanese = LANGUAGE.startsWith('ja')
