import { normalizeRepository, projectRepository } from '../runners/repository.js'
import { validateHooks } from '../hooks/config.js'
import { t } from '../i18n/index.js'
import { assertWorktreeIdle, discardTaskWorktree, withWorktreeOperation } from '../tasks/worktrees.js'
import type { Db } from '../db/database.js'
import * as repo from '../db/repo.js'
import { assertBuiltInEdit, ensureBuiltInProject } from './builtIn.js'
import type { Project, ProjectInput } from './types.js'

export class ProjectOperations {
  constructor(private db: Db, private changed: () => void, private wake: () => void, private removeTask?: (id: string) => void | Promise<void>) { }


  // -------------------------------------------------------------------------
  // Projects
  // -------------------------------------------------------------------------

  listProjects(): Project[] {
    return repo.listProjects(this.db)
  }


  createProject(input: Partial<ProjectInput> & { name: string; path: string }): Project {
    validateHooks(input.taskHooks ?? [])
    if (input.gitRemote?.trim()) input = { ...input, gitRemote: normalizeRepository(input.gitRemote.trim()) }
    if (input.runnerEnabled) input = { ...input, gitRemote: projectRepository(input.path, input.gitRemote).repository }
    const existing = repo.listProjects(this.db)

    /*
     * Choosing the same directory as a deleted project revives that row instead of creating one.
     * The soft delete leaves the row, so creating a new one lines up two rows on the same path and
     * import can no longer tell which to write into (neither the settings nor the colour carry over).
     */
    const previous = repo.findProjectByPath(this.db, input.path)
    if (previous?.deletedAt) {
      const revived = repo.reviveProject(this.db, previous.id)
      this.changed()
      this.wake()
      return revived
    }

    const project = repo.insertProject(this.db, {
      ...input,
      name: input.name,
      path: input.path,
      color: input.color ?? '#4EA8DE',
      priority: input.priority ?? 2,
      ...this.runTargetFor(input),
      maxConcurrent: input.maxConcurrent ?? 1,
      enabled: input.enabled ?? true,
      sortOrder: input.sortOrder ?? existing.length
    })
    this.changed()
    return project
  }


  /**
   * Where a new project's tasks run.
   *
   * A caller that says anything about the target is taken at its word. Otherwise the group
   * marked as the default steps in, so a project added from the rail can run tasks without a
   * detour through its settings. With no group marked it starts unassigned, as before.
   * Import does not come through here: a project it creates stays unassigned on purpose
   * (`import/importer.ts`), so nothing starts running in a directory that was merely seen.
   */
  private runTargetFor(input: Partial<ProjectInput>): Pick<ProjectInput, 'targetKind' | 'targetId'> {
    if (input.targetKind !== undefined || input.targetId !== undefined) {
      return { targetKind: input.targetKind ?? 'agent', targetId: input.targetId ?? null }
    }
    const group = repo.getDefaultGroup(this.db)
    return group ? { targetKind: 'group', targetId: group.id } : { targetKind: 'agent', targetId: null }
  }


  /** The built-in project, placed at this app's workspace (`builtIn.ts`). */
  ensureBuiltIn(workspace: string): Project {
    const project = ensureBuiltInProject(this.db, workspace)
    this.changed()
    return project
  }


  updateProject(id: string, patch: Partial<ProjectInput>): Project {
    if (patch.taskHooks) validateHooks(patch.taskHooks)
    if (patch.gitRemote?.trim()) patch = { ...patch, gitRemote: normalizeRepository(patch.gitRemote.trim()) }
    const current = repo.getProject(this.db, id)
    if (current) {
      assertBuiltInEdit(current, patch)
      if (current.builtIn && patch.runnerEnabled) throw new Error(t('runners.builtIn'))
      if ((patch.runnerEnabled ?? current.runnerEnabled) && (patch.runnerEnabled !== undefined || patch.gitRemote !== undefined || patch.path !== undefined)) {
        patch = { ...patch, gitRemote: projectRepository(patch.path ?? current.path, patch.gitRemote ?? current.gitRemote).repository }
      }
    }
    if (patch.path !== undefined) {
      for (const task of repo.listTasks(this.db, true).filter(task => task.projectId === id)) assertWorktreeIdle(this.db, task.id)
    }
    if (patch.path !== undefined && patch.path !== repo.getProject(this.db, id)?.path &&
      repo.listTasks(this.db, true).some(task => {
        const tree = task.projectId === id ? repo.getTaskWorktree(this.db, task.id) : null
        return (tree !== null && tree.state !== 'removed') || (task.projectId === id && repo.getRunnerWorkspace(this.db, task.id) !== null)
      })) {
      throw new Error(t('worktree.cannotMove'))
    }
    const project = repo.updateProject(this.db, id, patch)
    this.changed()
    this.wake()
    return project
  }


  deleteProject(id: string): void | Promise<void> {
    if (repo.getProject(this.db, id)?.builtIn) throw new Error(t('project.builtInDelete'))
    const tasks = repo.listTasks(this.db, true).filter(task => task.projectId === id)
    for (const task of tasks) assertWorktreeIdle(this.db, task.id)
    const remove = (): void => { repo.deleteProject(this.db, id); this.changed() }
    if (!tasks.some(task => repo.getTaskWorktree(this.db, task.id) || repo.getRunnerWorkspace(this.db, task.id))) return remove()
    const enabled = repo.getProject(this.db, id)?.enabled ?? false
    repo.updateProject(this.db, id, { enabled: false })
    return (async () => {
      try {
        for (const task of tasks) {
          if (this.removeTask) await this.removeTask(task.id)
          else await withWorktreeOperation(this.db, task.id, () => discardTaskWorktree(this.db, task.id))
        }
        repo.updateProject(this.db, id, { enabled })
        remove()
      } catch (error) {
        if (this.db.isOpen) { repo.updateProject(this.db, id, { enabled }); this.changed(); this.wake() }
        throw error
      }
    })()
  }
}
