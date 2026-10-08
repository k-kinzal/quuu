import { t } from '../i18n/index.js'
import type { AppSettings } from '../settings/types.js'
import type { ToastPayload } from '../snapshot.js'
import { selectSstpScript, sendSstp } from './sstp.js'

export function notificationTitle(event: ToastPayload): string {
  switch (event.notificationKind) {
    case 'assistant': return t('assistant.notificationTitle')
    case 'review': return t('notification.reviewTitle')
    case 'failure': return t('notification.failedTitle')
    case 'followUp': return t('notification.followUpTitle')
    case 'reportFailure': return t('notification.reportFailureTitle')
    case 'pullRequest': return t('notification.pullRequestTitle')
    case 'syncConflict': return t('notification.syncConflictTitle')
    default: return 'Quuu'
  }
}

export async function deliverNotification(event: ToastPayload, settings: AppSettings, ports: {
  toast: (event: ToastPayload) => void
  native: (event: ToastPayload, title: string) => void
  sstp?: typeof sendSstp
}): Promise<void> {
  if (!event.notificationKind) { ports.toast(event); return }
  if ((event.notificationKind === 'review' || event.notificationKind === 'assistant') && !settings.notifyOnReview) return
  if ((event.notificationKind === 'failure' || event.notificationKind === 'reportFailure') && !settings.notifyOnFailure) return
  const title = notificationTitle(event)
  if (settings.nativeNotifications) {
    try { ports.native(event, title) }
    catch (error) { console.warn('Native notification failed', error) }
  }
  if (settings.sstpEnabled) {
    const script = selectSstpScript(settings.sstpScripts, event, title)
    if (script !== null) {
      try { await (ports.sstp ?? sendSstp)(settings.sstpHost, settings.sstpPort, script) }
      catch (error) { console.warn('SSTP notification failed', error) }
    }
  }
}
