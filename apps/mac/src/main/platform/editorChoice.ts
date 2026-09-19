/**
 * The IDE / editor that opens a task's working directory.
 *
 * A different IDE per language (Go gets GoLand, iOS gets Xcode…), so
 * **the project decides which app opens it**. A project that hasn't decided
 * falls back to the app-wide default. The one place where main (which actually
 * opens) and renderer (which words the menu) go through the same rule.
 */

import type { Project } from '../projects/types.js'
import type { AppSettings } from '../settings/types.js'

export interface EditorApp {
  /**
   * Absolute path of the `.app`. **This is what gets stored.**
   *
   * Storing the name can't tell two editions apart (`PyCharm` vs
   * `PyCharm Community`, a Toolbox install vs a direct install).
   */
  path: string
  /** Display name (`.app` stripped). */
  name: string
}

/** Just the settings that matter here, so callers need not build a full `AppSettings`. */
export type EditorDefaults = Pick<AppSettings, 'editorApp'>

/** Just the part of a project that affects the open target. */
export type EditorHolder = Pick<Project, 'editorApp'>

/**
 * Path of the app that opens this project. Empty when undecided.
 *
 * The project's own setting if present, otherwise the app default.
 * There is no `off` (never open) — if there's nothing to open, just don't
 * show the action; making someone choose "can't open" has no point.
 */
export function resolveEditorApp(defaults: EditorDefaults, project: EditorHolder | null): string {
  const own = project?.editorApp.trim() ?? ''
  if (own.length > 0) return own
  return defaults.editorApp.trim()
}

/**
 * Build a display name from a path.
 *
 * Also names apps missing from the discovered list (a hand-picked app, a path
 * whose app was removed). **Never leave it blank** — if something is configured
 * but the screen reads "not set", the click happens without knowing where it opens.
 */
export function editorAppName(path: string, known: EditorApp[] = []): string {
  const trimmed = path.trim()
  if (trimmed.length === 0) return ''
  const found = known.find((e) => e.path === trimmed)
  if (found) return found.name
  const base = trimmed.split('/').filter(Boolean).pop() ?? trimmed
  return base.replace(/\.app$/i, '')
}
