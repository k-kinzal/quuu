import i18next from 'i18next'
import { en } from './en.js'
import { ja } from './ja.js'

/*
 * The screen's language follows the device and is fixed for the process
 * lifetime, so it is resolved once, synchronously, when this module first
 * evaluates — before any label table or view computes copy. Node-side tests
 * have no navigator and run in English, the source language.
 */
// The `window` guard (not `navigator`, which Node ≥21 also defines and fills with
// the machine locale) keeps Node-side tests deterministic: no window → English.
const language = typeof window === 'undefined' ? 'en' : navigator.language

const instance = i18next.createInstance()
void instance.init({
  lng: language,
  fallbackLng: 'en',
  resources: { en: { translation: en }, ja: { translation: ja } },
  // Values go into React elements, never into HTML strings.
  interpolation: { escapeValue: false },
  // All resources are bundled: init completes synchronously, t() is usable right away.
  initAsync: false
})

export const t = instance.t.bind(instance)

/** For handing the matching design-system string pack to ThemeProvider. */
export const isJapanese = (instance.resolvedLanguage ?? 'en').startsWith('ja')
