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
  | 'view.quuuAI'
  | 'view.all'
  | 'view.review'
  | 'view.done'
  | 'view.settings'
  | 'view.palette'
  | 'view.project'
  | 'view.search'
  /** Back / forward through the screens already seen. */
  | 'view.back'
  | 'view.forward'
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
