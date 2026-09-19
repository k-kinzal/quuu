import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { claudeProjectsDir } from '../appPaths.js'

/**
 * Claude Code writes logs to `~/.claude/projects/<slug>/<sessionId>.jsonl`,
 * where the slug is the cwd with every non-alphanumeric character replaced by `-`.
 *
 * e.g. /Users/me/Projects/app                       -> -Users-me-Projects-app
 *      /Users/me/Projects/ai-toolkit/.claude/... -> -Users-me-Projects-ai-toolkit--claude-...
 */
export function slugForCwd(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-')
}

export function expectedSessionLogPath(cwd: string, sessionId: string): string {
  return join(claudeProjectsDir(), slugForCwd(cwd), `${sessionId}.jsonl`)
}

/**
 * Resolves the actual path of the session log.
 * When it isn't at the expected path (e.g. the cwd went through a symlink),
 * scans every project directory to find it.
 */
export function resolveSessionLogPath(cwd: string, sessionId: string): string | null {
  const expected = expectedSessionLogPath(cwd, sessionId)
  if (existsSync(expected)) return expected

  let dirs: string[]
  try {
    dirs = readdirSync(claudeProjectsDir(), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  } catch {
    return null
  }

  for (const dir of dirs) {
    const candidate = join(claudeProjectsDir(), dir, `${sessionId}.jsonl`)
    if (existsSync(candidate)) return candidate
  }
  return null
}

/** Returns the directory so a watch can be set up before the log even exists. */
export function sessionLogDir(cwd: string): string {
  return join(claudeProjectsDir(), slugForCwd(cwd))
}
