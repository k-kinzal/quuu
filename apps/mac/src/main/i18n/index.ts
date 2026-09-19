import i18next from 'i18next'
import { en } from './en.js'
import { ja } from './ja.js'

/*
 * Copy the main process shows the user: native menus, context menus,
 * notifications, and the failure reasons that cross IPC into toasts.
 *
 * The OS locale is only readable through Electron's `app`, which this module
 * must not import (menu/context-menu templates are tested without Electron).
 * So the instance starts in English — the source language, which is also what
 * tests exercise — and the composition root calls `initMainI18n(app.getLocale())`
 * once at startup, before anything user-visible is built. Menus and reasons are
 * produced at event time, never at module load, so the switch is safe.
 */
const instance = i18next.createInstance()
void instance.init({
  lng: 'en',
  fallbackLng: 'en',
  resources: { en: { translation: en }, ja: { translation: ja } },
  // Values go into native menus and notifications, never into HTML strings.
  interpolation: { escapeValue: false },
  // All resources are bundled: init completes synchronously, t() is usable right away.
  initAsync: false
})

export function initMainI18n(locale: string): void {
  // Synchronous: all resources are bundled, nothing is fetched.
  void instance.changeLanguage(locale)
}

export const t = instance.t.bind(instance)
