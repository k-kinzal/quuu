import { join, resolve } from 'node:path'
import type { Db } from '../db/database.js'
import * as repo from '../db/repo.js'
import { t } from '../i18n/index.js'
import { QUUU_PROJECT_ID, type Project } from './types.js'

/*
 * The project Quuu keeps for operating Quuu itself.
 *
 * Its tasks are requests like "add a project for ~/src/foo" or "turn on worktrees": an agent
 * carries them out through the `quuu` CLI, the same operations every other client uses.
 */

export const QUUU_PROJECT_NAME = 'QuuuAI'

/**
 * The directory the built-in project runs in: `Resources/quuu-ai` inside the app.
 *
 * It holds the skill that teaches the CLI, and it ships with the app, so the instructions an agent
 * reads always describe the Quuu that launched it. A dev launch uses the checkout's copy.
 */
export function quuuWorkspaceDir(packaged: boolean, resourcesPath: string, dirname: string): string {
  return packaged ? join(resourcesPath, 'quuu-ai') : resolve(dirname, '../../quuu-ai')
}

/**
 * Where the bundled `quuu` launcher sits. It is the workspace's sibling in both layouts
 * (`Resources/bin`, and `apps/mac/bin` in a checkout), so the project row alone says where it is.
 */
export function quuuBinDir(project: Pick<Project, 'path'>): string {
  return resolve(project.path, '..', 'bin')
}

/** QuuuAI's own agent instructions (`AGENTS.md`, with `CLAUDE.md` pointing at it). */
export function quuuInstructionsPath(project: Pick<Project, 'path'>): string {
  return join(project.path, 'AGENTS.md')
}

export function quuuSkillPath(project: Pick<Project, 'path'>): string {
  return join(project.path, 'skills', 'quuu', 'SKILL.md')
}

/**
 * Make sure the built-in project exists and points at this app's workspace.
 *
 * Runs on every launch, not only the first: the app can be moved or replaced by an update, and a
 * dev launch and the packaged app share one database, so the path is whatever the running app
 * says it is. The workspace is not a repository, so worktrees stay off whatever the app-wide
 * default is, and a change report has no tree to compare, so it starts off too.
 */
export function ensureBuiltInProject(db: Db, workspace: string): Project {
  const existing = repo.getProject(db, QUUU_PROJECT_ID)
  if (!existing) {
    const group = repo.getDefaultGroup(db)
    return repo.insertProject(db, {
      name: QUUU_PROJECT_NAME,
      path: workspace,
      color: '#7C6CF2',
      // An operator's request is short and someone is waiting on it
      priority: 0,
      targetKind: group ? 'group' : 'agent',
      targetId: group?.id ?? null,
      maxConcurrent: 1,
      enabled: true,
      sortOrder: 0,
      worktreeMode: 'off',
      reportEnabled: false,
      // Nothing it does is committed, so no GitHub identity has to be ready before it can run
      commitIdentityMode: 'off',
      pullRequestPromptMode: 'off'
    }, QUUU_PROJECT_ID)
  }
  if (existing.deletedAt) repo.reviveProject(db, QUUU_PROJECT_ID)
  if (existing.path !== workspace || existing.worktreeMode !== 'off') {
    return repo.updateProject(db, QUUU_PROJECT_ID, { path: workspace, worktreeMode: 'off' })
  }
  return repo.getProject(db, QUUU_PROJECT_ID) ?? existing
}

/** Refuse the edits that would cut the built-in project off from the workspace it is made for. */
export function assertBuiltInEdit(project: Project, patch: Partial<Pick<Project, 'path' | 'worktreeMode'>>): void {
  if (!project.builtIn) return
  if (patch.path !== undefined && patch.path !== project.path) throw new Error(t('project.builtInPath'))
  if (patch.worktreeMode !== undefined && patch.worktreeMode !== 'off') throw new Error(t('project.builtInWorktree'))
}

/**
 * The instruction a fresh conversation in the built-in project ends with.
 *
 * The rules live in the workspace's AGENTS.md (CLAUDE.md for Claude Code), which most CLIs read
 * on their own. Naming both files by absolute path here reaches the ones that do not, and a slash
 * command would reach only one CLI. The files ship inside the app, so the path is also what
 * tells the agent which copy is current. A continued conversation already read them, so
 * follow-ups go out as the human wrote them.
 */
export function builtInPrompt(project: Project, message: string): string {
  if (!project.builtIn) return message
  return `${message.trimEnd()}

---
This task runs in Quuu's built-in ${QUUU_PROJECT_NAME} project: operate Quuu itself through the \`quuu\` CLI (on PATH: ${join(quuuBinDir(project), 'quuu')}).
Before acting, follow ${quuuInstructionsPath(project)} and read ${quuuSkillPath(project)} with the references it lists for this request.`
}
