import type { Db } from '../db/database.js'
import * as repo from '../db/repo.js'
import type { Project, ProjectInput } from './types.js'

export class ProjectOperations {
  constructor(private db: Db, private changed: () => void, private wake: () => void) { }


  // -------------------------------------------------------------------------
  // Projects
  // -------------------------------------------------------------------------

  listProjects(): Project[] {
    return repo.listProjects(this.db)
  }


  createProject(input: Partial<ProjectInput> & { name: string; path: string }): Project {
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


  updateProject(id: string, patch: Partial<ProjectInput>): Project {
    const project = repo.updateProject(this.db, id, patch)
    this.changed()
    this.wake()
    return project
  }


  deleteProject(id: string): void {
    repo.deleteProject(this.db, id)
    this.changed()
  }
}
