import { existsSync } from 'node:fs'
import { invocationFor } from '../agents/sessionOptions.js'
import type { Db } from '../db/database.js'
import * as repo from '../db/repo.js'
import type { Run } from '../execution/types.js'
import { t } from '../i18n/index.js'
import type { OpenResult, OpenTarget } from '../ipc/types.js'
import { discoverEditors, openInApp, openTargetFor } from '../platform/editorApps.js'
import type { EditorApp } from '../platform/editorChoice.js'
import { resolveEditorApp } from '../platform/editorChoice.js'
import { openTerminalAt, openTerminalWith } from '../platform/terminal.js'
import { structuredSessionTarget } from '../session/sessionAttach.js'
import { agentWorkplace } from '../session/workplace.js'
import type { AppSettings } from '../settings/types.js'
import type { Task } from '../tasks/types.js'
import type { Project } from './types.js'

export class WorkspaceOperations {
  constructor(private db: Db, private getSettings: () => AppSettings) { }


  // -------------------------------------------------------------------------
  // Open in an external app (terminal / IDE)
  // -------------------------------------------------------------------------

  /**
   * Where work on that target is happening.
   *
   * For a task, **where the most recent run actually worked** comes first. The run was launched
   * in the project's directory, but the agent may have moved into a worktree of its own (Claude
   * Code's EnterWorktree, Codex's `git worktree add`) and left its results there. What you want
   * to open is where the work is, not where it was registered - and the session log is what
   * knows (`session/workplace.ts`).
   */
  workingDir(target: OpenTarget): { dir: string; project: Project | null } | null {
    if (target.kind === 'project') {
      const project = repo.getProject(this.db, target.id)
      return project ? { dir: project.path, project } : null
    }
    if (target.kind === 'run') {
      const run = repo.getRun(this.db, target.id)
      if (!run) return null
      const task = repo.getTask(this.db, run.taskId)
      const project = task ? repo.getProject(this.db, task.projectId) : null
      return run.cwd.length > 0 ? { dir: this.workplaceOf(run, project), project } : null
    }
    const task = repo.getTask(this.db, target.id)
    if (!task) return null
    const project = repo.getProject(this.db, task.projectId)
    const run = repo.listRunsByTask(this.db, task.id)[0]
    const dir = run && run.cwd.length > 0 ? this.workplaceOf(run, project) : project?.path || ''
    return dir.length > 0 ? { dir, project } : null
  }


  /** Where that run's agent worked: the worktree it moved into, otherwise where it was launched. */
  private workplaceOf(run: Run, project: Project | null): string {
    return agentWorkplace({
      logPath: structuredSessionTarget(this.db, run)?.logPath ?? null,
      launchDir: run.cwd,
      projectDir: project?.path ?? run.cwd
    })
  }


  /** Open the working directory in a terminal. */
  async openTerminal(target: OpenTarget): Promise<OpenResult> {
    const place = this.readableDir(target)
    if ('reason' in place) return place
    return attempt(() => openTerminalAt(place.dir))
  }


  /**
   * Reopen a stopped session in a terminal, **still interactive**.
   *
   * The runs Quuu launches are non-interactive, so as-is a human cannot type a continuation.
   * Reopen the same session ID interactively and you can pick up where the conversation view left off.
   * The arguments differ per CLI, so assembling them is `agents/cli.ts`'s job.
   */
  async resumeInTerminal(taskId: string): Promise<OpenResult> {
    const task = repo.getTask(this.db, taskId)
    if (!task) return { ok: false, reason: t('tasks.notFound') }

    const invocation = this.resumeInvocationFor(task)
    if (!invocation) {
      return { ok: false, reason: t('workspace.noReopenableSession') }
    }
    const place = this.readableDir({ kind: 'task', id: taskId })
    if ('reason' in place) return place

    return attempt(() =>
      openTerminalWith(task.id, {
        cwd: place.dir,
        command: invocation.command,
        args: invocation.args,
        title: `Quuu — ${task.title}`
      })
    )
  }


  /**
   * Open the working directory in an IDE / editor.
   *
   * Without an `appPath`, it is decided project first, then app settings
   * (the IDE differs by language, so it is normally the project that decides).
   */
  async openEditor(target: OpenTarget, appPath?: string): Promise<OpenResult> {
    const place = this.readableDir(target)
    if ('reason' in place) return place

    const app = appPath?.trim() || resolveEditorApp(this.getSettings(), place.project)
    if (app.length === 0) {
      return { ok: false, reason: t('workspace.noEditorConfigured') }
    }
    return attempt(() => openInApp(app, openTargetFor(app, place.dir)))
  }


  /**
   * Where it actually opens. The reason, when it cannot.
   *
   * Used for handing to Finder, and when the UI needs the value itself (copying the path).
   * **This is the one place the destination is decided** - substituting the path the UI happens to
   * know (the project's registered directory) splits the destinations inside one menu: the terminal
   * goes to the worktree while Finder goes to the repository.
   */
  locate(target: OpenTarget): { dir: string } | { ok: false; reason: string } {
    return this.readableDir(target)
  }


  /** The IDEs / editors installed. They become the choices in settings and menus. */
  listEditors(): EditorApp[] {
    return discoverEditors()
  }


  // -------------------------------------------------------------------------
  // A task's workbench (review / built-in terminal)
  // -------------------------------------------------------------------------

  /**
   * The review target uses the place the task actually ran.
   *
   * Read work done in a worktree from the registered repository and it looks like nothing changed.
   * It goes through the same `workingDir` as the external-app path; no screen guesses on its own.
   */
  workbenchPlace(taskId: string): { dir: string; project: Project } {
    const place = this.readableDir({ kind: 'task', id: taskId })
    if ('reason' in place) throw new Error(place.reason)
    if (!place.project) throw new Error(t('tasks.projectNotFound'))
    return { dir: place.dir, project: place.project }
  }


  /** The launch shape for reopening that run interactively. null when it cannot be determined. */
  resumeInvocationFor(task: Task): ReturnType<typeof invocationFor> {
    const latest = repo.listRunsByTask(this.db, task.id)[0] ?? null
    const agent = latest ? repo.getAgent(this.db, latest.agentId) : null
    return invocationFor(task, latest, agent)
  }


  /** A working directory that exists. Returns the reason otherwise (so a press never silently does nothing). */
  private readableDir(
    target: OpenTarget
  ): { dir: string; project: Project | null } | { ok: false; reason: string } {
    const resolved = this.workingDir(target)
    if (!resolved) return { ok: false, reason: t('workspace.unknownWorkingDir') }
    if (!existsSync(resolved.dir)) {
      return { ok: false, reason: t('workspace.dirMissing', { dir: resolved.dir }) }
    }
    return resolved
  }
}
async function attempt(run: () => Promise<void>): Promise<OpenResult> {
  try {
    await run()
    return { ok: true }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) }
  }
}
