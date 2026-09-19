/**
 * The IDE / editor that opens a task's working directory.
 *
 * People use a different IDE per language (Go gets GoLand, iOS gets Xcode…), so
 * **the project decides which app opens it**. Projects that haven't decided fall
 * back to the app-wide default. This is the one place where main (actually
 * opening) and the renderer (wording the menu) go through the same rule.
 */


import type { EditorApp } from '../../../preload/api/desktop.js'
export type { EditorApp, EditorDefaults, EditorHolder } from '../../../preload/api/desktop.js'

/** Only the slice of settings that matters here. Callable without building a whole `AppSettings`. */
import type { EditorDefaults } from '../../../preload/api/desktop.js'

/** Only the slice of the project that affects where it opens. */
import type { EditorHolder } from '../../../preload/api/desktop.js'

/**
 * Path of the app that opens this project. Empty if undecided.
 *
 * The project's own value if set, else the app default.
 * No `off` (don't open) — if it shouldn't open, just don't offer the action;
 * making someone pick "cannot open" is pointless.
 */
export function resolveEditorApp(defaults: EditorDefaults, project: EditorHolder | null): string {
  const own = project?.editorApp.trim() ?? ''
  if (own.length > 0) return own
  return defaults.editorApp.trim()
}

/**
 * Build a display name from a path.
 *
 * Even something absent from the discovered-app list (a hand-picked app, a path
 * left after deletion) gets a name. **Never blank** — if the setting holds
 * something but the screen reads "not set", the user presses without knowing
 * where it will open.
 */
export function editorAppName(path: string, known: EditorApp[] = []): string {
  const trimmed = path.trim()
  if (trimmed.length === 0) return ''
  const found = known.find((e) => e.path === trimmed)
  if (found) return found.name
  const base = trimmed.split('/').filter(Boolean).pop() ?? trimmed
  return base.replace(/\.app$/i, '')
}
