import { Checkbox, Page } from '@design-system/react'
import { t } from '../../model/i18n/index.js'
import { useSettings, useStore } from '../../state/store.js'

/**
 * Settings > Notifications.
 *
 * A surface with two controls doesn't need two stacked headings ("Notifications" plus
 * "When to notify"). Make sections only when there are two or more groups to separate.
 */
export function NotificationSettings(): JSX.Element {
  const settings = useSettings()
  const setSettings = useStore((s) => s.setSettings)

  return (
    <Page title={t('notificationSettings.title')}>
      <Checkbox
        label={t('notificationSettings.notifyOnReview')}
        checked={settings.notifyOnReview}
        onChange={(v: boolean) => void setSettings({ notifyOnReview: v })}
      />
      <Checkbox
        label={t('notificationSettings.notifyOnFailure')}
        checked={settings.notifyOnFailure}
        onChange={(v: boolean) => void setSettings({ notifyOnFailure: v })}
      />
    </Page>
  )
}
