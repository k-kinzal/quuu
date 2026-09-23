import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { copilotSessionsDir } from '../../appPaths.js'

/**
 * Identity of a GitHub Copilot CLI session.
 *
 * Lives at `~/.copilot/session-state/<sessionId>/workspace.yaml`:
 *
 *   id: 7ac4398d-…
 *   cwd: /Users/me/Projects/taskd
 *   user_named: false
 *   created_at: 2026-05-28T23:53:40.317Z
 *   updated_at: 2026-05-28T23:53:42.391Z
 *   name: say hi
 *
 * A subset of YAML, but the values are all flat one-liners. To avoid adding
 * a library (AGENTS.md), read only this shape. Unreadable lines are ignored.
 */

export interface CopilotWorkspace {
  sessionId: string
  cwd: string
  title: string | null
  createdAt: string | null
  updatedAt: string | null
}

export function copilotSessionDir(sessionId: string): string {
  return join(copilotSessionsDir(), sessionId)
}

export function copilotEventsPath(sessionId: string): string {
  return join(copilotSessionDir(sessionId), 'events.jsonl')
}

export function readCopilotWorkspace(sessionId: string): CopilotWorkspace | null {
  let text: string
  try {
    text = readFileSync(join(copilotSessionDir(sessionId), 'workspace.yaml'), 'utf8')
  } catch {
    return null
  }

  const fields = new Map<string, string>()
  for (const line of text.split('\n')) {
    const at = line.indexOf(':')
    // Don't read nesting (leading whitespace). Every wanted value is top-level.
    if (at <= 0 || /^\s/.test(line)) continue
    fields.set(line.slice(0, at).trim(), unquote(line.slice(at + 1).trim()))
  }

  const cwd = fields.get('cwd')
  if (!cwd) return null

  const name = fields.get('name')
  return {
    sessionId: fields.get('id') ?? sessionId,
    cwd,
    title: name && name.length > 0 ? name : null,
    createdAt: fields.get('created_at') ?? null,
    updatedAt: fields.get('updated_at') ?? null
  }
}

function unquote(value: string): string {
  if (value.length >= 2 && /^["'].*["']$/.test(value)) return value.slice(1, -1)
  return value
}
