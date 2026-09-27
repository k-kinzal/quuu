import type { Project } from '../../../api/schemas/projects.js'
import { compareText } from './collation.js'

export function compareProjectNames(a: Project, b: Project): number {
  return compareText(a.name, b.name) || compareText(a.path, b.path) || a.id.localeCompare(b.id)
}

/** Navigation order: the built-in project heads the list, the rest follow by name. */
export function projectsByName(projects: Project[]): Project[] {
  return [...projects].sort((a, b) => Number(b.builtIn) - Number(a.builtIn) || compareProjectNames(a, b))
}

/** Display choices by recent use; execution priority stays with the scheduler. */
export function projectOptions(projects: Project[], recentRunCounts: Readonly<Record<string, number>> = {}): Project[] {
  return [...projects].sort((a, b) =>
    (recentRunCounts[b.id] ?? 0) - (recentRunCounts[a.id] ?? 0) || compareProjectNames(a, b)
  )
}
