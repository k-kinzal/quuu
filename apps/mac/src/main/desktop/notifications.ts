import { Notification } from 'electron'
import type { ToastPayload } from '../snapshot.js'

// Keep click handlers alive while the notifications are in Notification Center.
const active = new Set<Notification>()

export function showNativeNotification(event: ToastPayload, title: string, open: (taskId?: string) => void): void {
  if (!Notification.isSupported()) return
  const notification = new Notification({
    title, body: event.detail ? `${event.message}\n${event.detail}` : event.message, silent: false
  })
  active.add(notification)
  notification.on('click', () => { open(event.taskId); active.delete(notification) })
  notification.on('close', () => active.delete(notification))
  notification.on('failed', (_event, error) => {
    active.delete(notification)
    console.warn('Native notification failed', error)
  })
  try { notification.show() }
  catch (error) { active.delete(notification); throw error }
}
