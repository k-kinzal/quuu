/**
 * Expanding the argument template of an agent definition.
 *
 * Placeholders such as `{{prompt}}` are replaced with real values.
 * When one argument is a placeholder on its own, the value is passed through as-is (nothing goes
 * through a shell, so no quoting is needed; a prompt with newlines passes safely as one argument).
 */

export interface TemplateVars {
  prompt: string
  title: string
  sessionId: string
  projectPath: string
  projectName: string
  taskId: string
  runId: string
  [key: string]: string
}

export const TEMPLATE_VARS: Array<{ name: string; description: string }> = [
  { name: 'prompt', description: 'The task prompt body (the title when unset)' },
  { name: 'title', description: 'The task title' },
  { name: 'sessionId', description: 'The session UUID for this run (minted by Quuu)' },
  { name: 'projectPath', description: 'Absolute path of the project' },
  { name: 'projectName', description: 'Project name' },
  { name: 'taskId', description: 'Task ID' },
  { name: 'runId', description: 'Run ID' }
]

const PLACEHOLDER = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g

export function expandTemplate(template: string, vars: TemplateVars): string {
  return template.replace(PLACEHOLDER, (match, key: string) => {
    const value = vars[key]
    return value === undefined ? match : value
  })
}

export function expandArgs(argsTemplate: string[], vars: TemplateVars): string[] {
  return argsTemplate.map((arg) => expandTemplate(arg, vars))
}

/** The unknown variable names used in a template (for validating the definition form). */
export function unknownVars(argsTemplate: string[]): string[] {
  const known = new Set(TEMPLATE_VARS.map((v) => v.name))
  const found = new Set<string>()
  for (const arg of argsTemplate) {
    for (const m of arg.matchAll(PLACEHOLDER)) {
      if (!known.has(m[1])) found.add(m[1])
    }
  }
  return [...found]
}
