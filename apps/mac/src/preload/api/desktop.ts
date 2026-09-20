import { z } from 'zod'
import { ProjectSchema } from './projects.js'
import { SessionMessageSchema, SessionSnapshotSchema } from './session.js'
import { AppSettingsSchema, CommitIdentitySchema } from './settings.js'

export const EditorAppSchema = z.object({
  /**
   * Absolute path of the `.app`. **This is what gets stored.**
   *
   * Storing the name cannot distinguish two editions with the same name
   * (`PyCharm` vs `PyCharm Community`, a Toolbox-installed copy vs a direct
   * install).
   */
  path: z.string(),
  /** Display name (with `.app` stripped). */
  name: z.string()
})
export type EditorApp = z.infer<typeof EditorAppSchema>

/** Only the settings that matter here, so callers need not build a whole `AppSettings`. */
export const EditorDefaultsSchema = AppSettingsSchema.pick({ editorApp: true })
export type EditorDefaults = z.infer<typeof EditorDefaultsSchema>

/** Only the part of a project that affects where to open. */
export const EditorHolderSchema = ProjectSchema.pick({ editorApp: true })
export type EditorHolder = z.infer<typeof EditorHolderSchema>

/**
 * Whose working directory to open.
 *
 *   task    … where the task's most recent run lived (the worktree if there was one)
 *   run     … where that run lived (a past run may have lived somewhere different from now)
 *   project … the registered directory
 *
 * The caller states outright which one it means, so main never has to guess
 * "is this a task ID or a project ID".
 */
export const OpenTargetSchema = z.object({
  kind: z.union([z.literal('task'), z.literal('run'), z.literal('project')]),
  id: z.string()
})
export type OpenTarget = z.infer<typeof OpenTargetSchema>

/** Result of opening an external app. When nothing opened, the reason comes back. */
export const OpenResultSchema = z.object({
  ok: z.boolean(),
  reason: z.string().optional()
})
export type OpenResult = z.infer<typeof OpenResultSchema>

/**
 * Confirmation for an irreversible action.
 *
 * `window.confirm` is a Web dialog drawn inside the window; neither its button
 * wording nor its layout is the OS's. Ask with an OS sheet instead.
 */
export const ConfirmRequestSchema = z.object({
  message: z.string(),
  detail: z.string().optional(),
  /** Label of the acting button. Not "OK" — say what will happen. */
  confirmLabel: z.string()
})
export type ConfirmRequest = z.infer<typeof ConfirmRequestSchema>

/**
 * One row handed to the OS menu.
 *
 * The renderer sends only **what to show**; drawing is left to the OS.
 * Functions cannot cross IPC, so the chosen row comes back as its `id`.
 */
export const MenuTemplateItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  /** A checkable row. Used when re-selecting a single value. */
  checked: z.boolean().optional(),
  /** Display-only shortcut text (`Cmd+N` etc.). No key is bound here. */
  accelerator: z.string().optional(),
  separatorBefore: z.boolean().optional(),
  disabled: z.boolean().optional(),
  get submenu() { return MenuTemplateItemSchema.array().optional() }
})
export type MenuTemplateItem = z.infer<typeof MenuTemplateItemSchema>

export const PopupMenuRequestSchema = z.object({
  items: MenuTemplateItemSchema.array(),
  /**
   * Where to open (renderer CSS pixels).
   * Omitted means open at the cursor — the default for right-click.
   */
  x: z.number().optional(),
  y: z.number().optional()
})
export type PopupMenuRequest = z.infer<typeof PopupMenuRequestSchema>

/**
 * App-wide commands.
 *
 * Shortcuts are defined in exactly one place: the native menu.
 * The renderer never double-captures the same keys; it only executes these commands.
 */
export const AppCommandSchema = z.union([z.literal('task.new'), z.literal('task.addAfter'), z.literal('task.addBefore'), z.literal('task.runNow'), z.literal('task.markDone'), z.literal('task.sendBack'), z.literal('task.archive'), z.literal('task.delete'), z.literal('task.close'), z.literal('task.open'), z.literal('task.setPriority'), z.literal('task.openTerminal'), z.literal('task.resumeTerminal'), z.literal('task.openEditor'), z.literal('view.all'), z.literal('view.review'), z.literal('view.settings'), z.literal('view.palette'), z.literal('view.project'), z.literal('view.search'), z.literal('view.back'), z.literal('view.forward'), z.literal('panel.rail'), z.literal('panel.list'), z.literal('panel.inspector'), z.literal('project.settings'), z.literal('project.add'), z.literal('focus.next'), z.literal('focus.prev'), z.literal('menu.context')])
export type AppCommand = z.infer<typeof AppCommandSchema>

export const CommandPayloadSchema = z.object({
  command: AppCommandSchema,
  taskId: z.string().optional(),
  /** Destination. Used by `view.project`. */
  projectId: z.string().optional(),
  /** Used by commands that carry a value (the priority of `task.setPriority`). */
  value: z.number().optional()
})
export type CommandPayload = z.infer<typeof CommandPayloadSchema>

export const SessionAppendedPayloadSchema = z.object({
  /** Which Run's conversation this is. The session ID can be swapped mid-run, so match on this. */
  runId: z.string(),
  sessionId: z.string(),
  messages: SessionMessageSchema.array(),
  /** Whether this includes replacement of already-rendered messages (re-parse of the tail line, etc.). */
  replaceFromId: z.union([z.string(), z.null()]),
  /** Full replacement and new read target when switching from stdout to the structured log. */
  replacement: SessionSnapshotSchema.omit({ messages: true, sessionId: true }).optional()
})
export type SessionAppendedPayload = z.infer<typeof SessionAppendedPayloadSchema>

/** Query for the GitHub App's bot user ID. */
export const BotUserResultSchema = z.union([z.object({
  ok: z.literal(true),
  botUserId: z.string()
}), z.object({
  ok: z.literal(false),
  reason: z.string()
})])
export type BotUserResult = z.infer<typeof BotUserResultSchema>

/**
 * Result of creating the GitHub App in the browser.
 *
 * The App ID and config version come back together. If an older App cannot be
 * told apart, we would hand gh's identity to an App that cannot authenticate —
 * so the creation result is passed around as one unit.
 */
export const CreateAppResultSchema = z.union([z.object({
  ok: z.literal(true),
  identity: CommitIdentitySchema
}), z.object({
  ok: z.literal(false),
  reason: z.string(),
  canceled: z.boolean().optional()
})])
export type CreateAppResult = z.infer<typeof CreateAppResultSchema>

export const RunNowResultSchema = z.object({
  ok: z.boolean(),
  reason: z.string().optional(),
  /** A run was in progress, so instead of sending now it was held as a reservation. */
  reserved: z.boolean().optional()
})
export type RunNowResult = z.infer<typeof RunNowResultSchema>
