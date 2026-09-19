import type { Project } from '../../../preload/api/projects.js'
import { compareText } from './collation.js'

/** Sorts only the options A–Z. Never rewrites execution priority or the nav's order. */
export function projectOptions(projects: Project[]): Project[] {
  return [...projects].sort((a, b) => compareText(a.name, b.name) || compareText(a.path, b.path) || a.id.localeCompare(b.id))
}
