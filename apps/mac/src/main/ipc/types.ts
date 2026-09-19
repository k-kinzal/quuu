



import type { CommitIdentity } from '../settings/identity.js'




import type { SessionMessage } from '../session/types.js'




/**
 * Which working directory to open.
 *
 *   task    ... where that task's most recent run was (its worktree, if any)
 *   run     ... where that run was (a past run may be somewhere else than now)
 *   project ... the registered directory
 *
 * The caller states outright which one it means, so main never has to guess
 * "is this a task ID or a project ID".
 */
export type OpenTarget = { kind: 'task' | 'run' | 'project'; id: string }


/** The result of opening an external app. Returns the reason when it did not open. */
export interface OpenResult {
  ok: boolean
  reason?: string
}


/**
 * Confirmation for an operation that cannot be undone.
 *
 * `window.confirm` is a web dialog drawn inside the window, and neither its button wording nor
 * their order is the OS's. Ask with an OS sheet instead.
 */
export interface ConfirmRequest {
  message: string
  detail?: string
  /** Wording for the button that goes through with it. Not "OK" - say what will happen */
  confirmLabel: string
}


/**
 * One row handed to an OS menu.
 *
 * The renderer sends only **what to show**; drawing is left to the OS.
 * Functions cannot cross IPC, so the chosen row comes back as an `id`.
 */
export interface MenuTemplateItem {
  id: string
  label: string
  /** A row with a checkmark. Used when re-picking one value */
  checked?: boolean
  /** Shortcut text for display only (`Cmd+N` etc). No key is bound here */
  accelerator?: string
  separatorBefore?: boolean
  disabled?: boolean
  submenu?: MenuTemplateItem[]
}


export interface PopupMenuRequest {
  items: MenuTemplateItem[]
  /**
   * Where to open it (renderer CSS pixels).
   * Omitted, it opens at the cursor - the default for a right-click.
   */
  x?: number
  y?: number
}


/**
 * App-wide commands.
 *
 * Shortcuts are defined in exactly one place: the native menu.
 * The renderer never picks the same key up a second time; it just runs these commands.
 */
export type AppCommand =
  | 'task.new'
  /** Queue a new task tied to the selected one (comes after / finish first). */
  | 'task.addAfter'
  | 'task.addBefore'
  | 'task.runNow'
  | 'task.markDone'
  | 'task.sendBack'
  | 'task.archive'
  | 'task.delete'
  | 'task.close'
  | 'task.open'
  | 'task.setPriority'
  /** Open the working directory in a terminal / IDE (the worktree, if there is one). */
  | 'task.openTerminal'
  | 'task.resumeTerminal'
  | 'task.openEditor'
  | 'view.all'
  | 'view.review'
  | 'view.settings'
  | 'view.palette'
  | 'view.project'
  | 'view.search'
  | 'panel.rail'
  | 'panel.list'
  | 'panel.inspector'
  | 'project.settings'
  | 'project.add'
  /*
   * Which surface the hands are on.
   *
   * A pointer just presses where it is, but a keyboard needs **a way to choose a surface**.
   * Without one, there is no telling who the arrow keys or Enter are addressed to
   */
  | 'focus.next'
  | 'focus.prev'
  /** Open the right-click menu for the row, column or surface the hands are on, right there. */
  | 'menu.context'


export interface CommandPayload {
  command: AppCommand
  taskId?: string
  /** Where to go. Used by `view.project` */
  projectId?: string
  /** Used by operations that carry a value (the priority for `task.setPriority`) */
  value?: number
}


export interface SessionAppendedPayload {
  /** Which run's conversation. The session ID can be swapped mid-flight, so matching happens on this. */
  runId: string
  sessionId: string
  messages: SessionMessage[]
  /** Whether it includes replacements for already-rendered messages (a re-parsed trailing line, say). */
  replaceFromId: string | null
}


/** Query for a GitHub App's bot user ID. */
export type BotUserResult = { ok: true; botUserId: string } | { ok: false; reason: string }


/**
 * The result of creating a GitHub App in the browser.
 *
 * The App ID and setup version come back with it. Without telling an old App apart from a new one,
 * gh's identity would be handed to an App that cannot authenticate, so the creation result is
 * passed around as one unit.
 */
export type CreateAppResult =
  | { ok: true; identity: CommitIdentity }
  /** `canceled` is when a human stopped it themselves. Do not restate that to them as a failure. */
  | { ok: false; reason: string; canceled?: boolean }


export interface RunNowResult {
  ok: boolean
  reason?: string
  /** It was running, so instead of sending now it was held as a reservation. */
  reserved?: boolean
}