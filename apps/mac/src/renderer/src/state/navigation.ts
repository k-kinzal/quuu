import type { AppSnapshot } from '../../../preload/api/snapshot.js'

/**
 * Navigation (rule A: hierarchy of disclosure).
 *
 *   L0 section    … picked on the rail. Picking one never opens L2
 *   L1 collection … the whole picture of that section
 *   L2 entity     … opens only after picking in L1
 */
export type Section =
  | { kind: 'all' }
  | { kind: 'review' }
  | { kind: 'project'; id: string }
  | { kind: 'settings' }

export type SettingsCategory = 'general' | 'agents' | 'report' | 'notifications' | 'mobile' | 'appearance'

export function sameSection(a: Section, b: Section): boolean {
  if (a.kind !== b.kind) return false
  return a.kind === 'project' && b.kind === 'project' ? a.id === b.id : true
}

/**
 * Where a person is standing.
 *
 * Back and forward move between these, so a Place holds **what decides which
 * screen is on show** and nothing else. Pane widths, sort order and filters are
 * how the screen is set up rather than where you are; carried in here, going
 * back would undo a resize nobody asked it to.
 *
 * The highlighted row is in, though. With the detail open it *is* the screen,
 * and with it closed, returning to a list to find the highlight where you left
 * it is the difference between coming back and starting over.
 */
export interface Place {
  section: Section
  cursorTaskId: string | null
  detailOpen: boolean
  settingsCategory: SettingsCategory
  editingAgentId: string | null
  editingGroupId: string | null
  projectSettingsOpen: boolean
}

/** Where the window opens. The store's initial state is built from this, so the trail starts where the screen does. */
export const INITIAL_PLACE: Place = {
  section: { kind: 'all' },
  cursorTaskId: null,
  detailOpen: false,
  settingsCategory: 'general',
  editingAgentId: null,
  editingGroupId: null,
  projectSettingsOpen: false
}

/**
 * Everywhere this window has been, and how far back through it the person has stepped.
 *
 * **Never persisted.** "The screen I was just looking at" is about this sitting.
 * Relaunching tomorrow and pressing back into last night's task is not going
 * back, it is being sent somewhere.
 */
export interface Trail {
  places: Place[]
  index: number
}

export const INITIAL_TRAIL: Trail = { places: [INITIAL_PLACE], index: 0 }

/**
 * How many steps the trail keeps.
 *
 * Opening tasks one after another fills it faster than a browser's — deep
 * enough to cover a morning of wandering, bounded so a window left open for
 * days does not hold every task it ever showed.
 */
const LIMIT = 50

/** The Place inside a wider state. The store's own fields carry these names, so it is a plain pick. */
export function placeOf(state: Place): Place {
  return {
    section: state.section,
    cursorTaskId: state.cursorTaskId,
    detailOpen: state.detailOpen,
    settingsCategory: state.settingsCategory,
    editingAgentId: state.editingAgentId,
    editingGroupId: state.editingGroupId,
    projectSettingsOpen: state.projectSettingsOpen
  }
}

export function samePlace(a: Place, b: Place): boolean {
  return (
    sameSection(a.section, b.section) &&
    a.cursorTaskId === b.cursorTaskId &&
    a.detailOpen === b.detailOpen &&
    a.settingsCategory === b.settingsCategory &&
    a.editingAgentId === b.editingAgentId &&
    a.editingGroupId === b.editingGroupId &&
    a.projectSettingsOpen === b.projectSettingsOpen
  )
}

/**
 * Write a move into the trail.
 *
 * `from` overwrites the entry being left, so a row highlighted after arriving
 * there is still highlighted when you come back. What lay ahead is dropped —
 * the rule a browser follows: once you walk off down another path, what you had
 * gone forward into is no longer somewhere you can return to.
 */
export function record(trail: Trail, from: Place, to: Place): Trail {
  if (samePlace(from, to)) return trail
  const places = trail.places.slice(0, trail.index + 1)
  places[trail.index] = from
  places.push(to)
  const dropped = Math.max(0, places.length - LIMIT)
  return { places: places.slice(dropped), index: places.length - 1 - dropped }
}

/**
 * Which entry a step in that direction lands on, or null when there is nowhere to go.
 *
 * An entry can name a task that has since been deleted or a project that was
 * archived. Landing on one shows "task not found" — a dead end with nothing to
 * press — so walk past it instead. A destination that is gone is not somewhere
 * to go back to.
 */
export function stepTo(trail: Trail, step: -1 | 1, snapshot: AppSnapshot | null): number | null {
  for (let i = trail.index + step; i >= 0 && i < trail.places.length; i += step) {
    if (reachable(trail.places[i], snapshot)) return i
  }
  return null
}

function reachable(place: Place, snapshot: AppSnapshot | null): boolean {
  // Nothing loaded yet, so there is no evidence anything is gone
  if (!snapshot) return true
  const section = place.section
  if (section.kind === 'project' && !snapshot.projects.some((p) => p.id === section.id)) return false
  // Only an open detail names an entity. A highlight on a vanished row just starts the list at the top
  const taskId = place.cursorTaskId
  if (place.detailOpen && taskId !== null && !snapshot.tasks.some((t) => t.id === taskId)) return false
  return true
}
