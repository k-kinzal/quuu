import { EventEmitter } from 'node:events'
import type { Db } from '../db/database.js'
import * as repo from '../db/repo.js'
import { appPageUrl, botEmail, botLogin, isCommitIdentityComplete, isGitHubAppCurrent, normalizeAppSlug, resolveCommitIdentity } from './commitIdentity.js'
import type { CommitIdentity } from './identity.js'
import { DEFAULT_SETTINGS, type AppSettings } from './types.js'

export class SettingsOperations extends EventEmitter {
  private value: AppSettings = DEFAULT_SETTINGS
  constructor(private db: Db) { super() }
  previewIdentity(identity: CommitIdentity, projectId?: string) {
    const project = projectId ? repo.getProject(this.db, projectId) : null
    const slug = normalizeAppSlug(identity.appSlug)
    return { slug, login: botLogin(slug), email: botEmail(identity), complete: isCommitIdentityComplete(identity), current: isGitHubAppCurrent(identity), url: appPageUrl(slug), resolved: resolveCommitIdentity(this.value, project ?? { commitIdentityMode: 'inherit', commitIdentity: identity }) }
  }
  setIdentity(identity: CommitIdentity): AppSettings {
    return this.setSettings({ commitIdentity: identity, commitIdentityEnabled: isCommitIdentityComplete(this.value.commitIdentity) ? this.value.commitIdentityEnabled : isCommitIdentityComplete(identity) })
  }
  load(): void { this.value = repo.getAppSettings(this.db) }
  getSettings(): AppSettings { return this.value }
  setSettings(patch: Partial<AppSettings>): AppSettings {
    // undefined in a partial update means unspecified. No entry point — GUI, CLI, or sync — erases existing values.
    const next = { ...this.value, ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) }
    repo.saveAppSettings(this.db, next)
    this.value = next
    this.emit('changed', next, patch)
    return next
  }
}
