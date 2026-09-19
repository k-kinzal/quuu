import type { MenuItemSpec } from '@design-system/react'
import type { OpenResult, OpenTarget } from '../../../preload/api/desktop.js'
import type { Project } from '../../../preload/api/projects.js'
import { editorAppName, resolveEditorApp } from '../model/editorName.js'
import { t } from '../model/i18n/index.js'
import { useStore } from '../state/store.js'

/**
 * The entry point for opening the working directory externally.
 *
 * The same set appears on task rows, the detail view, run history, and
 * projects, so ordering and wording live here. **What opens is not the
 * directory but "where that task actually was"** (the worktree if there is
 * one), and main decides that (`app.locate`).
 *
 * **This set is the only "open".** Finder is pulled in here too because
 * opening Finder on the path the screen knows (the project's registered path)
 * creates two sets pointing at different places in the same menu — **terminal
 * at the worktree, Finder at the repository** (that actually happened).
 */

/** The outcome of a press. The screen shows success, so speak **only on failure**. */
function report(result: Promise<OpenResult>): void {
  void result.then((r) => {
    if (r.ok) return
    useStore.getState().pushToast({
      id: `open-${Date.now()}`,
      level: 'warn',
      message: t('openWith.openFailed'),
      detail: r.reason
    })
  })
}

/** The project the target belongs to. Needed to pick the IDE (project → app settings). */
function projectOf(target: OpenTarget): Project | null {
  const snapshot = useStore.getState().snapshot
  if (!snapshot) return null
  if (target.kind === 'project') return snapshot.projects.find((p) => p.id === target.id) ?? null

  const taskId =
    target.kind === 'run'
      ? (snapshot.runs.find((r) => r.id === target.id)?.taskId ?? null)
      : target.id
  const task = taskId ? snapshot.tasks.find((t) => t.id === taskId) : null
  return task ? (snapshot.projects.find((p) => p.id === task.projectId) ?? null) : null
}

/**
 * The CLI name if the task can be reopened interactively; null if it can't.
 *
 * The decision itself (how arguments are built) lives in `main/agents/cli.ts`,
 * shared with main. Writing a separate check here creates **rows that can be
 * pressed but do nothing**.
 */
export function resumableCli(taskId: string): string | null {
  const snapshot = useStore.getState().snapshot
  if (!snapshot) return null
  return snapshot.resumeCommands?.[taskId] ?? null
}

/**
 * The three commands from the native menu (keystrokes).
 *
 * They go **through the same functions as the menu rows**. Written separately,
 * a mismatch quietly appears where right-click opens one thing and ⌘⇧T opens
 * another. Reasons it can't open (no session, IDE unset) come back from main
 * and are spoken via toast.
 */
export function openWithCommand(
  command: 'task.openTerminal' | 'task.resumeTerminal' | 'task.openEditor',
  taskId: string
): void {
  const target: OpenTarget = { kind: 'task', id: taskId }
  if (command === 'task.openTerminal') report(window.quuu.open.terminal(target))
  else if (command === 'task.resumeTerminal') report(window.quuu.open.resume(taskId))
  else report(window.quuu.open.editor({ target }))
}

export interface OpenWithOptions {
  /**
   * Whether to show keystroke labels.
   *
   * Only panes that act on **the currently selected task** may show them.
   * The native menu bindings target the selected task, so putting the same
   * labels on project rows or past runs is a lying signpost — the key would
   * hit something else.
   */
  accelerators?: boolean
}

/**
 * The open-in-terminal / open-in-IDE set.
 *
 * No separators here (callers wrap with `group()`). It can never be empty,
 * so every pane shows the same 3–4 rows in the same order.
 */
export function openWithItems(
  target: OpenTarget,
  { accelerators = false }: OpenWithOptions = {}
): MenuItemSpec[] {
  const state = useStore.getState()
  const key = (accelerator: string): string | undefined =>
    accelerators ? accelerator : undefined

  const items: MenuItemSpec[] = [
    {
      label: t('openWith.openTerminal'),
      accelerator: key('Cmd+Shift+T'),
      onSelect: () => report(window.quuu.open.terminal(target))
    }
  ]

  /*
   * The entry point for typing the continuation of a stopped session by hand.
   *
   * Runs Quuu launches are non-interactive, so the moment you read one and
   * thought "I want to fix just this part myself" you hit a dead end.
   * Reopening the same session interactively lets you pick up right where
   * you left off reading in the conversation view.
   */
  if (target.kind === 'task') {
    const cli = resumableCli(target.id)
    if (cli) {
      items.push({
        label: t('openWith.resumeCli', { cli }),
        accelerator: key('Cmd+Shift+R'),
        onSelect: () => report(window.quuu.open.resume(target.id))
      })
    }
  }

  const editors = state.editors
  const app = resolveEditorApp(state.settings ?? { editorApp: '' }, projectOf(target))
  if (app.length > 0) {
    items.push({
      label: t('openWith.openInApp', { app: editorAppName(app, editors) }),
      accelerator: key('Cmd+Shift+E'),
      onSelect: () => report(window.quuu.open.editor({ target }))
    })
  }

  items.push({
    // Sometimes you want an app other than the chosen one (the same repo in Xcode and in VS Code)
    label: app.length > 0 ? t('openWith.openAnotherApp') : t('openWith.openApp'),
    submenu: [
      ...editors
        .filter((e) => e.path !== app)
        .map((editor) => ({
          label: editor.name,
          onSelect: () => report(window.quuu.open.editor({ target: target, appPath: editor.path }))
        })),
      {
        label: t('openWith.chooseApp'),
        separatorBefore: editors.length > 0,
        onSelect: () => {
          void window.quuu.system.pickApplication().then((path) => {
            if (path) report(window.quuu.open.editor({ target: target, appPath: path }))
          })
        }
      }
    ]
  })

  items.push({ label: t('openWith.showInFinder'), onSelect: () => report(window.quuu.open.reveal(target)) })

  return items
}

/**
 * One row that copies the path being opened. **Hands over the same place the
 * open operations use.**
 *
 * The screen doesn't know that place (main decides), so we ask only after the
 * press. Pasting a path we merely think we know puts something different from
 * what opened onto the clipboard.
 */
export function copyWorkingDirItem(target: OpenTarget, label = t('openWith.copyWorkingDir')): MenuItemSpec {
  return {
    label,
    onSelect: () => {
      void window.quuu.open.workingDir(target).then((path) => {
        if (path) void window.quuu.system.copy(path)
      })
    }
  }
}
