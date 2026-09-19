import type { Db } from '../db/database.js'
import * as repo from '../db/repo.js'
import { t } from '../i18n/index.js'
import { promptAsValue } from './cli.js'
import { DEFAULT_LIMIT_PATTERNS } from './defaults.js'
import type { Agent, AgentGroup, AgentGroupInput, AgentInput } from './types.js'
import { isManagedAgent } from './types.js'

export class AgentOperations {
  defaults(): { limitPatterns: string[] } { return { limitPatterns: [...DEFAULT_LIMIT_PATTERNS] } }
  constructor(private db: Db, private changed: () => void, private wake: () => void) { }


  // -------------------------------------------------------------------------
  // Agents / groups
  // -------------------------------------------------------------------------

  /**
   * An agent created from the UI always belongs to the user.
   * Only Quuu itself may create a behind-the-scenes definition (the kind import uses).
   */
  createAgent(input: AgentInput): Agent {
    const agent = repo.insertAgent(this.db, {
      ...literalPrompt(input.command, input),
      source: 'user'
    })
    this.changed()
    return agent
  }


  updateAgent(id: string, patch: Partial<AgentInput>): Agent {
    const current = this.assertNotManagedAgent(id)
    const command = patch.command ?? current?.command ?? ''
    const agent = repo.updateAgent(this.db, id, literalPrompt(command, patch))
    this.changed()
    this.wake()
    return agent
  }


  /**
   * A copy of an agent, ready to be edited into a variant (another model, other flags).
   *
   * Every launch setting is carried over; only what would make two definitions collide is
   * changed. The copy starts **disabled**, so a second set of slots for the same command
   * never starts picking up tasks before the user has told it apart from the original, and
   * it lands at the end of the list, where a new row is expected to appear.
   */
  duplicateAgent(id: string): Agent {
    const source = this.assertNotManagedAgent(id)
    if (!source) throw new Error(`agent not found: ${id}`)
    const { id: _id, createdAt: _c, updatedAt: _u, source: _s, ...settings } = source
    const last = Math.max(-1, ...repo.listAgents(this.db).map((agent) => agent.sortOrder))
    const copy = repo.insertAgent(this.db, {
      ...settings,
      name: t('agents.copyName', { name: source.name }),
      enabled: false,
      sortOrder: last + 1,
      source: 'user'
    })
    this.changed()
    return copy
  }


  deleteAgent(id: string): void {
    this.assertNotManagedAgent(id)
    repo.deleteAgent(this.db, id)
    this.changed()
  }


  /**
   * Stop changes to a behind-the-scenes definition before they arrive from the UI.
   *
   * The UI hides them, but hiding is only about appearance. Even if one could be deleted, import
   * just recreates it, so never create a state where the operation looks accepted but nothing changed.
   */
  private assertNotManagedAgent(id: string): Agent | null {
    const agent = repo.getAgent(this.db, id)
    if (agent && isManagedAgent(agent)) {
      throw new Error(`managed agent is not editable: ${agent.name}`)
    }
    return agent
  }


  createGroup(input: AgentGroupInput): AgentGroup {
    const group = repo.insertGroup(this.db, {
      ...input,
      memberIds: this.selectableMemberIds(input.memberIds)
    })
    this.changed()
    return group
  }


  updateGroup(id: string, patch: Partial<AgentGroupInput>): AgentGroup {
    const group = repo.updateGroup(
      this.db,
      id,
      patch.memberIds
        ? { ...patch, memberIds: this.selectableMemberIds(patch.memberIds) }
        : patch
    )
    this.changed()
    this.wake()
    return group
  }


  /**
   * Drop behind-the-scenes definitions from a group's members.
   * If something hidden slipped into a run target through a group, an agent that never appears on
   * screen would be running tasks.
   */
  private selectableMemberIds(ids: string[]): string[] {
    return ids.filter((id) => {
      const agent = repo.getAgent(this.db, id)
      return !agent || !isManagedAgent(agent)
    })
  }


  deleteGroup(id: string): void {
    repo.deleteGroup(this.db, id)
    this.changed()
  }
}


/**
 * Store the argument templates in the shape that hands the prompt over as text.
 *
 * The correction happens on the way in rather than at launch, so **the settings screen keeps
 * showing what will actually run**. Without it, a message opening with `--cached` reaches the CLI
 * as an option and the CLI exits before the agent starts. What the shape is per CLI, and when it
 * is left alone, is `agents/cli.ts`'s call.
 */
function literalPrompt<T extends Partial<AgentInput>>(command: string, input: T): T {
  return {
    ...input,
    ...(input.argsTemplate && { argsTemplate: promptAsValue(command, input.argsTemplate) }),
    ...(input.resumeArgsTemplate && {
      resumeArgsTemplate: promptAsValue(command, input.resumeArgsTemplate)
    })
  }
}
