import { PromptFileSchema } from './api/files.js'
import { oc } from '@orpc/contract'
import { z } from 'zod'
import { AgentGroupInputSchema, AgentGroupSchema, AgentInputSchema, AgentSchema } from "./api/agents.js"
import { TaskRuleInputSchema, TaskRuleSchema } from "./api/automation.js"
import { BotUserResultSchema, ConfirmRequestSchema, CreateAppResultSchema, EditorAppSchema, OpenResultSchema, OpenTargetSchema, PopupMenuRequestSchema, RunNowResultSchema } from "./api/desktop.js"
import { RunSchema, SchedulerStatusSchema } from "./api/execution.js"
import { ProjectInputSchema, ProjectSchema } from "./api/projects.js"
import { ReportViewRequestSchema, TaskReportSchema } from "./api/report.js"
import { ReviewActionResultSchema, ReviewCommentInputSchema, ReviewFileRequestSchema, ReviewFileSchema, ReviewSnapshotSchema } from "./api/review.js"
import { SessionSnapshotSchema } from "./api/session.js"
import { AppSettingsSchema, CommitIdentitySchema, IdentityPreviewSchema } from "./api/settings.js"
import { AppSnapshotSchema, MobileSyncStatusSchema } from "./api/snapshot.js"
import { TaskInputSchema, TaskPatchSchema, TaskSchema } from "./api/tasks.js"
import { PullRequestViewRequestSchema, TerminalSessionSchema } from "./api/workbench.js"

const procedure = oc.errors({ OPERATION_FAILED: { data: z.object({ reason: z.string() }) } })

/** The public contract implemented by both Electron ends and by test mocks. */
export const contract = {
  snapshot: procedure.output(AppSnapshotSchema),
  projects: {
    list: procedure.output(ProjectSchema.array()),
    create: procedure.input(ProjectInputSchema.partial().extend({
      name: z.string(),
      path: z.string()
    })).output(ProjectSchema),
    update: procedure.input(z.object({
      id: z.string(),
      patch: ProjectInputSchema.partial().strict()
    })).output(ProjectSchema),
    remove: procedure.input(z.string()).output(z.void()),
  },
  tasks: {
    create: procedure.input(TaskInputSchema.strict()).output(TaskSchema),
    update: procedure.input(z.object({
      id: z.string(),
      patch: TaskPatchSchema.strict()
    })).output(TaskSchema),
    enqueue: procedure.input(z.string()).output(TaskSchema),
    unqueue: procedure.input(z.string()).output(TaskSchema),
    hold: procedure.input(z.string()).output(TaskSchema),
    runNow: procedure.input(z.string()).output(RunNowResultSchema),
    markDone: procedure.input(z.string()).output(TaskSchema),
    reopen: procedure.input(z.string()).output(TaskSchema),
    sendBack: procedure.input(z.object({
      id: z.string(),
      note: z.string()
    })).output(TaskSchema),
    cancel: procedure.input(z.string()).output(TaskSchema),
    remove: procedure.input(z.string()).output(z.void()),
    archive: procedure.input(z.object({
      id: z.string(),
      archived: z.boolean()
    })).output(TaskSchema),
    send: procedure.input(z.object({
      id: z.string(),
      message: z.string()
    })).output(RunNowResultSchema),
    clearReserved: procedure.input(z.string()).output(TaskSchema),
  },
  rules: {
    preview: procedure.input(TaskRuleSchema.pick({ whenIdle: true, cron: true, blockStatuses: true })).output(z.object({
      nextAt: z.union([z.string(), z.null()]),
      valid: z.boolean(),
      hasCondition: z.boolean()
    })),
    create: procedure.input(TaskRuleInputSchema.strict()).output(TaskRuleSchema),
    update: procedure.input(z.object({
      id: z.string(),
      patch: TaskRuleInputSchema.partial().strict()
    })).output(TaskRuleSchema),
    remove: procedure.input(z.string()).output(z.void()),
    enqueue: procedure.input(z.string()).output(TaskSchema),
  },
  agents: {
    defaults: procedure.output(z.object({
      get limitPatterns() { return z.string().array() }
    })),
    create: procedure.input(AgentInputSchema.strict()).output(AgentSchema),
    update: procedure.input(z.object({
      id: z.string(),
      patch: AgentInputSchema.partial().strict()
    })).output(AgentSchema),
    duplicate: procedure.input(z.string()).output(AgentSchema),
    remove: procedure.input(z.string()).output(z.void()),
  },
  groups: {
    create: procedure.input(AgentGroupInputSchema.strict()).output(AgentGroupSchema),
    update: procedure.input(z.object({
      id: z.string(),
      patch: AgentGroupInputSchema.partial().strict()
    })).output(AgentGroupSchema),
    remove: procedure.input(z.string()).output(z.void()),
  },
  runs: {
    byTask: procedure.input(z.string()).output(RunSchema.array()),
    cancel: procedure.input(z.string()).output(z.void()),
  },
  session: {
    close: procedure.output(z.void()),
    load: procedure.input(z.string()).output(SessionSnapshotSchema),
    loadMore: procedure.input(z.object({ runId: z.string(), direction: z.enum(['older', 'newer', 'latest']) })).output(SessionSnapshotSchema),
    image: procedure.input(z.string()).output(z.union([z.string(), z.null()])),
  },
  scheduler: {
    status: procedure.output(SchedulerStatusSchema),
    pause: procedure.output(SchedulerStatusSchema),
    resume: procedure.output(SchedulerStatusSchema),
  },
  settings: {
    previewIdentity: procedure.input(z.object({
      identity: CommitIdentitySchema,
      projectId: z.string().optional()
    })).output(IdentityPreviewSchema),
    setIdentity: procedure.input(CommitIdentitySchema.strict()).output(AppSettingsSchema),
    get: procedure.output(AppSettingsSchema),
    set: procedure.input(AppSettingsSchema.partial().strict()).output(AppSettingsSchema),
    lookupBotUser: procedure.input(z.string()).output(BotUserResultSchema),
    createGitHubApp: procedure.output(CreateAppResultSchema),
    cancelGitHubApp: procedure.output(z.void()),
  },
  mobile: {
    status: procedure.output(MobileSyncStatusSchema),
    syncNow: procedure.output(MobileSyncStatusSchema),
  },
  importer: {
    sync: procedure.output(z.object({
      scanned: z.number(),
      createdTasks: z.number(),
      createdProjects: z.number(),
      updated: z.number(),
      running: z.number()
    })),
  },
  open: {
    terminal: procedure.input(OpenTargetSchema.strict()).output(OpenResultSchema),
    resume: procedure.input(z.string()).output(OpenResultSchema),
    editor: procedure.input(z.object({
      target: OpenTargetSchema,
      appPath: z.string().optional()
    })).output(OpenResultSchema),
    reveal: procedure.input(OpenTargetSchema.strict()).output(OpenResultSchema),
    workingDir: procedure.input(OpenTargetSchema.strict()).output(z.union([z.string(), z.null()])),
    editors: procedure.output(EditorAppSchema.array()),
  },
  review: {
    snapshot: procedure.input(z.string()).output(ReviewSnapshotSchema),
    refresh: procedure.input(z.string()).output(ReviewSnapshotSchema),
    file: procedure.input(z.object({
      taskId: z.string(),
      request: ReviewFileRequestSchema
    })).output(ReviewFileSchema),
    comment: procedure.input(z.object({
      taskId: z.string(),
      input: ReviewCommentInputSchema
    })).output(ReviewActionResultSchema),
    openPullRequest: procedure.input(PullRequestViewRequestSchema.strict()).output(ReviewActionResultSchema),
    hidePullRequest: procedure.input(z.string()).output(ReviewActionResultSchema),
    closePullRequest: procedure.input(z.string()).output(ReviewActionResultSchema),
  },
  report: {
    get: procedure.input(z.string()).output(z.union([TaskReportSchema, z.null()])),
    generate: procedure.input(z.string()).output(ReviewActionResultSchema),
    show: procedure.input(ReportViewRequestSchema.strict()).output(ReviewActionResultSchema),
    hide: procedure.output(ReviewActionResultSchema),
  },
  terminal: {
    open: procedure.input(z.object({
      taskId: z.string(),
      columns: z.number().int().positive(),
      rows: z.number().int().positive()
    })).output(TerminalSessionSchema),
    input: procedure.input(z.object({
      sessionId: z.string(),
      input: z.string()
    })).output(ReviewActionResultSchema),
    resize: procedure.input(z.object({
      sessionId: z.string(),
      columns: z.number().int().positive(),
      rows: z.number().int().positive()
    })).output(ReviewActionResultSchema),
    runProjectTask: procedure.input(z.object({
      taskId: z.string(),
      sessionId: z.string(),
      projectTaskId: z.string()
    })).output(ReviewActionResultSchema),
    close: procedure.input(z.string()).output(z.void()),
  },
  system: {
    savePromptFiles: procedure.input(PromptFileSchema.array()).output(z.string().array()),
    windowLayout: procedure.output(z.object({
      leftInset: z.number(),
      collapsedRailWidth: z.number(),
      overhang: z.number()
    })),
    pickDirectory: procedure.output(z.union([z.string(), z.null()])),
    pickApplication: procedure.output(z.union([z.string(), z.null()])),
    confirm: procedure.input(ConfirmRequestSchema.strict()).output(z.boolean()),
    popupMenu: procedure.input(PopupMenuRequestSchema.strict()).output(z.union([z.string(), z.null()])),
    reveal: procedure.input(z.string()).output(z.void()),
    openExternal: procedure.input(z.string()).output(z.void()),
    copy: procedure.input(z.string()).output(z.void()),
  },
}
