import type { Attributes } from '@opentelemetry/api'
import type { Db } from '../db/database.js'
import type { AppSettings } from '../settings/types.js'
import type { AppSnapshot, ToastPayload } from '../snapshot.js'
import { TASK_STATUSES } from '../tasks/status.js'
import { ATTR, EVENT } from './attributes.js'
import { emitEvent } from './index.js'
import { observeTaskLifecycle } from './lifecycle.js'

/** What telemetry watches on the running app. `QuuuApp` satisfies it. */
export interface ObservedApp {
  readonly db: Db
  snapshot(): AppSnapshot
  on(event: 'notify', listener: (toast: ToastPayload) => void): unknown
  readonly settings: {
    getSettings(): AppSettings
    on(event: 'changed', listener: (settings: AppSettings) => void): unknown
  }
}

/**
 * Start reporting the app's own facts. Called before bootstrap, so the runs startup recovery settles
 * (those that ended while Quuu was closed) are reported too.
 */
export function observeApp(app: ObservedApp): () => void {
  const stopLifecycle = observeTaskLifecycle(app.db)
  app.settings.on('changed', settings => emitEvent(EVENT.settingsProfile, settingsProfile(settings)))
  // The toast itself may quote a task; only what kind of news it was leaves.
  app.on('notify', toast => emitEvent(EVENT.notification, {
    [ATTR.notificationKind]: toast.notificationKind ?? 'feedback',
    [ATTR.notificationLevel]: toast.level,
    ...(toast.projectId ? { [ATTR.projectId]: toast.projectId } : {}),
    ...(toast.taskId ? { [ATTR.taskId]: toast.taskId } : {})
  }))
  return stopLifecycle
}

/** What is set up, once the app has bootstrapped. */
export function reportLaunch(app: ObservedApp): void {
  emitEvent(EVENT.appStarted, inventory(app.snapshot()))
  emitEvent(EVENT.settingsProfile, settingsProfile(app.settings.getSettings()))
}

/**
 * How much of Quuu is set up, at launch. A feature with nothing configured is one not in use.
 */
export function inventory(snapshot: AppSnapshot): Attributes {
  const userAgents = snapshot.agents.filter(agent => agent.source === 'user')
  const live = snapshot.tasks.filter(task => !task.archived)
  const attributes: Attributes = {
    'quuu.inventory.projects': snapshot.projects.length,
    'quuu.inventory.agents': userAgents.length,
    'quuu.inventory.agents.enabled': userAgents.filter(agent => agent.enabled).length,
    'quuu.inventory.agent_adapters': [...new Set(userAgents.filter(agent => agent.enabled).map(agent => agent.logAdapter))].sort(),
    'quuu.inventory.agents.with_fallback': userAgents.filter(agent => agent.fallbackAgentId !== null).length,
    'quuu.inventory.groups': snapshot.groups.length,
    'quuu.inventory.rules': snapshot.rules.length,
    'quuu.inventory.rules.enabled': snapshot.rules.filter(rule => rule.enabled).length,
    'quuu.inventory.tasks': live.length,
    'quuu.inventory.tasks.archived': snapshot.tasks.length - live.length,
    'quuu.inventory.tasks.imported': live.filter(task => task.source === 'imported').length
  }
  for (const status of TASK_STATUSES) attributes[`quuu.inventory.tasks.${status}`] = live.filter(task => task.status === status).length
  return attributes
}

/**
 * The settings as switches and counts. Booleans and numbers are reported as they are; a string
 * only as whether it is set (it may be a path or a name), a list as its length.
 */
export function settingsProfile(settings: AppSettings): Attributes {
  const attributes: Attributes = {}
  for (const [key, value] of Object.entries(settings)) {
    const name = `quuu.settings.${key}`
    if (typeof value === 'boolean' || typeof value === 'number') attributes[name] = value
    else if (typeof value === 'string') attributes[`${name}.set`] = value.trim() !== ''
    else if (Array.isArray(value)) attributes[`${name}.count`] = value.length
  }
  return attributes
}
