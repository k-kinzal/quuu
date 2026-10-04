import { Notification } from 'electron'
import { createHash } from 'node:crypto'
import { userDataDir } from '../appPaths.js'
import type { ToastPayload } from '../snapshot.js'

// Keep click handlers alive while the notifications are in Notification Center.
const active = new Set<Notification>()

interface NotificationTarget { taskId?: string }

function idPrefix(): string {
  // Verification profiles must never open a production task's notification.
  const profile = createHash('sha256').update(userDataDir()).digest('hex')
  return `quuu:1:${profile}:`
}

function targetFromId(id: string): NotificationTarget | null {
  const prefix = idPrefix()
  if (!id.startsWith(prefix)) return null
  const parts = id.slice(prefix.length).split(':')
  if (parts.length !== 2 || !parts[1]) return null
  try { return parts[0] ? { taskId: decodeURIComponent(parts[0]) } : {} }
  catch { return null }
}

export function nativeNotificationLaunch(info: unknown): NotificationTarget | null {
  if (!info || typeof info !== 'object' || !('identifier' in info) || typeof info.identifier !== 'string') return null
  if (!('actionIdentifier' in info) || info.actionIdentifier !== 'com.apple.UNNotificationDefaultActionIdentifier') return null
  return targetFromId(info.identifier)
}

function listen(notification: Notification, taskId: string | undefined, open: (taskId?: string) => void): void {
  active.add(notification)
  notification.on('click', () => { active.delete(notification); open(taskId) })
  notification.on('close', () => active.delete(notification))
  notification.on('failed', (_event, error) => {
    active.delete(notification)
    console.warn('Native notification failed', error)
  })
}

export async function restoreNativeNotifications(open: (taskId?: string) => void): Promise<void> {
  if (process.platform !== 'darwin' || !Notification.isSupported()) return
  try {
    for (const notification of await Notification.getHistory()) {
      const target = targetFromId(notification.id)
      if (target) listen(notification, target.taskId, open)
    }
  } catch (error) { console.warn('Cannot restore native notifications', error) }
}

export function showNativeNotification(event: ToastPayload, title: string, open: (taskId?: string) => void): void {
  if (!Notification.isSupported()) return
  const notification = new Notification({
    // macOS keeps the identifier across restarts; a JS closure alone loses the destination.
    ...(process.platform === 'darwin' ? { id: `${idPrefix()}${encodeURIComponent(event.taskId ?? '')}:${encodeURIComponent(event.id)}` } : {}),
    title, body: event.detail ? `${event.message}\n${event.detail}` : event.message, silent: false
  })
  listen(notification, event.taskId, open)
  try { notification.show() }
  catch (error) { active.delete(notification); throw error }
}
