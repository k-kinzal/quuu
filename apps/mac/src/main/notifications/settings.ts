import { t } from '../i18n/index.js'
import type { AppSettings } from '../settings/types.js'
import { NOTIFICATION_KINDS } from './types.js'

export function validateNotificationSettings(settings: AppSettings): void {
  if (!settings.sstpHost || settings.sstpHost.length > 253 || !/^[a-zA-Z0-9.:%_-]+$/.test(settings.sstpHost)) throw new Error(t('notification.invalidSstpHost'))
  if (!Number.isInteger(settings.sstpPort) || settings.sstpPort < 1 || settings.sstpPort > 65535) throw new Error(t('notification.invalidSstpPort'))
  for (const kind of NOTIFICATION_KINDS) {
    const scripts = settings.sstpScripts?.[kind]
    if (!Array.isArray(scripts) || scripts.length > 100 || scripts.some(script => typeof script !== 'string' || script.length > 16000 || script.includes('\0'))) throw new Error(t('notification.invalidSstpScripts'))
  }
}
